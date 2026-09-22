/**
 * OBX x Faclon demo - Digital Logbook FORM SCHEMA (field-level) + entry builder.
 *
 * FORMS           : 14 form definitions (4 real OBX controlled BPRs + 10 demo formats), every section and field.
 * enrichLogbooks  : rebuilds dataset.logbookEntries so that every entry's `fields` follows its FormDef exactly
 *                   (same keys, units, sources, limits), and adds entries for forms the base generator does not create.
 * buildDataset    : use this in the app instead of buildDemoDataset (see data/index.ts).
 *
 * Real vs demo: FOR-BIP-009/010/004/003 numbers, titles, revisions and effective dates are OBX's. Their field lists
 * follow the pre-read description of the paper records; exact column order must be confirmed against the scanned
 * forms (demoLayout: true). Every numeric limit is a DEMO limit unless `limitRef` cites an OBX SOP.
 */
import type { DemoDataset, LogbookEntry, LogbookTemplate, Role, ShiftId, Source, Batch } from './types';
import { valueAt, shiftOf, PEOPLE, TAGS } from './generator';

// ------------------------------------------------------------------ schema types
export type FieldType =
  | 'text' | 'longtext' | 'number' | 'datetime' | 'duration' | 'select' | 'multiselect'
  | 'boolean' | 'attest' | 'esign' | 'scan' | 'photo' | 'passfail' | 'link' | 'id';

/** How the value gets into the form. 'manual' = operator types / picks it. */
export type Capture =
  | 'manual'      // operator entry
  | 'live'        // snapshot of a controller/PLC tag at entry time (read-only, operator acknowledges)
  | 'milestone'   // timestamp derived from a tag rule (e.g. T_INT <= -18 for 5 min)
  | 'calc'        // calculated from other fields / recipe
  | 'genealogy'   // from batch genealogy (parent lots, IDs)
  | 'scale'       // weighed on a connected scale
  | 'lims'        // HPLC / external COA result
  | 'erp'         // Acumatica
  | 'system';     // who/when, set by the app

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  capture: Capture;
  source: Source;
  required: boolean;
  unit?: string;
  decimals?: number;
  /** tag this value is read from (capture live/milestone) */
  tag?: string;
  /** limits: out-of-limit blocks submit until comment + deviation link */
  target?: number; min?: number; max?: number;
  /** OBX document that sets the limit. Absent => demo limit (show "Demo limit - pending OBX Quality") */
  limitRef?: string;
  options?: string[];
  /** formula / rule shown in the info tooltip */
  rule?: string;
  /** only these roles may edit (default Operator) */
  editableBy?: Role[];
  /** show only for these assets (prefix match) */
  appliesTo?: string[];
  /** limits apply only on these repeat rows (e.g. wash 3) */
  limitRows?: number[];
  help?: string;
}

export interface FormSection {
  id: string;
  title: string;
  /** repeating block, e.g. 2-hour check rows, crashes 1..4, washes 1..3 */
  repeat?: { min: number; max: number; label: string };
  /** which asset's batch fills this section (for multi-asset forms) */
  appliesTo?: string[];
  fields: FormField[];
}

export interface SignoffStep { step: 'Perform' | 'Review' | 'Approve' | 'Verify'; role: Role; meaning: string }

export interface FormDef extends LogbookTemplate {
  purpose: string;
  governingSop: string[];
  recordModel: string;
  demoLayout: boolean;
  sections: FormSection[];
  signoff: SignoffStep[];
  blockingRules: string[];
  escalation: string;
}

// ------------------------------------------------------------------ field helpers (keep definitions readable)
const f = (key: string, label: string, type: FieldType, capture: Capture, source: Source, extra: Partial<FormField> = {}): FormField =>
  ({ key, label, type, capture, source, required: true, ...extra });
const live = (key: string, label: string, tag: string, unit: string, extra: Partial<FormField> = {}) =>
  f(key, label, 'number', 'live', 'Controller', { tag, unit, decimals: 1, ...extra });
const sp = (key: string, label: string, unit: string, target: number) =>
  f(key, label, 'number', 'live', 'Controller', { unit, target, decimals: 1, help: 'Setpoint read from controller' });
const time = (key: string, label: string, capture: Capture = 'manual', source: Source = 'Manual', extra: Partial<FormField> = {}) =>
  f(key, label, 'datetime', capture, source, extra);
const sign = (key = 'INITIALS', label = 'Operator initials (e-sign)') => f(key, label, 'esign', 'manual', 'Manual');
const opt = (x: Partial<FormField> = {}): Partial<FormField> => ({ required: false, ...x });

const SOP_ISO = 'SOP-BIP-003';
const SOP_D8 = 'SOP-BIP-005';
const SOP_DIST = 'SOP-BIP-004 / SOP-BIP-006 (governing scope unresolved)';
const PERFORM_REVIEW_APPROVE: SignoffStep[] = [
  { step: 'Perform', role: 'Operator', meaning: 'I performed / observed these entries' },
  { step: 'Review', role: 'Shift Supervisor', meaning: 'Reviewed for completeness; exceptions addressed' },
  { step: 'Approve', role: 'QA', meaning: 'QA approval - record locked' },
];

// ------------------------------------------------------------------ WFE forms (shared structure)
const wfeSections = (is2M: boolean): FormSection[] => {
  const a = is2M ? 'L2-WFE-2M' : 'L2-WFE-1M';
  const s = is2M ? { wiper: 300, feed: 3.5, evap: 175, cond: 70, chl: -15 } : { wiper: 300, feed: 5, evap: 150, cond: 50, chl: -10 };
  const tg = (k: string) => TAGS.find(t => t.assetId === a && t.key === k)!;
  const lim = (k: string) => ({ min: tg(k).lsl, max: tg(k).usl });
  const sections: FormSection[] = [
    { id: 'HEADER', title: 'Batch header', fields: [
      f('BATCH_ID', 'Distillation batch ID', 'id', 'genealogy', 'ERP', { help: is2M ? 'Format 2M-YYMMDD-NN' : 'Format 1M-YYMMDD-NN' }),
      f('INPUT_LOTS', is2M ? 'Source 1M residue lot(s)' : 'Source crude / WDC lot(s)', 'multiselect', 'genealogy', 'ERP'),
      f('ASSET', 'Equipment', 'text', 'system', 'Calculated'),
      time('START_TIME', 'Run start', 'milestone', 'Calculated', { rule: 'First STEADY FEED timestamp from state engine' }),
    ] },
    { id: 'HANDOFF', title: 'Shift handoff', fields: [
      f('OUT_OPERATOR', 'Outgoing operator', 'esign', 'manual', 'Manual'),
      f('IN_OPERATOR', 'Incoming operator', 'esign', 'manual', 'Manual'),
      time('HANDOFF_TIME', 'Handoff time'),
      f('HANDOFF_NOTES', 'Handoff notes', 'longtext', 'manual', 'Manual', opt()),
    ] },
    { id: 'CHECK', title: '2-hour check', repeat: { min: 1, max: 12, label: 'Check' }, fields: [
      time('CHECK_TIME', 'Check time', 'system', 'Calculated'),
      sp('WIPER_SP', 'Wiper speed SP', 'rpm', s.wiper), live('WIPER_PV', 'Wiper speed actual', 'WIPER_PV', 'rpm', { decimals: 0, ...lim('WIPER_PV') }),
      sp('FEED_SP', 'Feed rate SP', 'kg/h', s.feed), live('FEED_PV', 'Feed rate actual', 'FEED_PV', 'kg/h', { decimals: 2, ...lim('FEED_PV') }),
      f('RUNOFF', 'Run-off observation', 'select', 'manual', 'Manual', { options: ['Steady flow', 'Slow flow', 'Intermittent', 'No flow'] }),
      f('RUNOFF_TARGET', 'Target (per SOP)', 'text', 'system', 'Calculated', opt({ help: 'Displayed from SOP; confirm column meaning with OBX' })),
      live('VAC_PV', 'Vacuum', 'VAC_PV', 'mbar', { decimals: 3, ...lim('VAC_PV') }),
      sp('EVAP_SP', 'Evaporator temp SP', 'degC', s.evap), live('EVAP_PV', 'Evaporator temp actual', 'EVAP_PV', 'degC', lim('EVAP_PV')),
      sp('COND_SP', 'Condenser temp SP', 'degC', s.cond), live('COND_PV', 'Condenser temp actual', 'COND_PV', 'degC', lim('COND_PV')),
      sp('CHL_SP', 'Chiller temp SP', 'degC', s.chl), live('CHL_PV', 'Chiller temp actual', 'CHL_PV', 'degC', lim('CHL_PV')),
      f('ACK', 'Operator acknowledges auto values', 'attest', 'manual', 'Manual'),
      sign(),
    ] },
  ];
  if (is2M) sections.push({ id: 'OIL', title: 'Oil added', repeat: { min: 0, max: 6, label: 'Addition' }, fields: [
    time('OIL_TIME', 'Oil-added time'),
    f('OIL_KG', 'Oil added', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
    f('OIL_CONFIRM', 'Oil addition confirmed', 'attest', 'manual', 'Manual'),
    sign(),
  ] });
  sections.push({ id: 'CLOSE', title: 'Mass & timing (batch close)', fields: [
    f('MASS_IN', 'Mass in', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 1 }),
    f('MASS_DIST', is2M ? 'Mass distillate' : 'Mass distillate (terpene cut)', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 1 }),
    f('MASS_RES', is2M ? 'Mass residue' : 'Mass residue (run-off to 2M)', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 1 }),
    f('MASS_BAL', 'Mass balance', 'number', 'calc', 'Calculated', { unit: '%', decimals: 1, min: 97, max: 101, rule: '(distillate + residue) / mass in x 100' }),
    time('STOP_TIME', 'Run stop', 'milestone', 'Calculated'),
    f('RUN_H', 'Total run time', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 2, rule: 'Sum of RUN time in STEADY FEED' }),
  ] });
  if (is2M) sections.push({ id: 'DISTILLATE', title: 'Distillate quality', fields: [
    f('POTENCY', 'Distillate potency (total cannabinoids)', 'number', 'lims', 'LIMS/COA', { unit: '%', decimals: 1, min: 85 }),
    f('D9_THC', 'Delta-9 THC', 'number', 'lims', 'LIMS/COA', { unit: '% w/w', decimals: 3, max: 0.3, help: 'Hold if above limit (QL2-05)' }),
    f('COLOUR', 'Distillate colour', 'select', 'manual', 'Manual', { options: ['Light gold', 'Gold', 'Amber', 'Dark'] }),
  ] });
  sections.push({ id: 'EXCEPTIONS', title: 'Exceptions', fields: [
    f('DEV_REF', 'Deviation reference', 'link', 'manual', 'Manual', opt()),
    f('COMMENTS', 'Comments', 'longtext', 'manual', 'Manual', opt()),
  ] });
  return sections;
};

// ------------------------------------------------------------------ the form library
export const FORMS: FormDef[] = [
  {
    formNo: 'FOR-BIP-009', title: '1M Distillation Log', revision: 'Rev. 2', effective: '2025-11-17', assets: ['L2-WFE-1M'], level: 'entry', everyH: 2, demo: false,
    purpose: 'Record 1M wiped-film deterpenation run: setpoints vs actuals every 2 h, mass in/out, shift handoff.',
    governingSop: [SOP_DIST], recordModel: 'One record per 1M batch; one entry per 2-hour check row + one close entry', demoLayout: true,
    sections: wfeSections(false), signoff: PERFORM_REVIEW_APPROVE,
    blockingRules: ['Any live value outside min/max blocks submit until comment + deviation link', 'Check row cannot be submitted > 30 min after due without late-entry reason'],
    escalation: 'Logbook entry overdue (2-h check): Operator @ due+10 min, Supervisor @ +30 min, Production Manager @ +2 h',
  },
  {
    formNo: 'FOR-BIP-010', title: '2M Distillation Log', revision: 'Rev. 2', effective: '2025-11-17', assets: ['L2-WFE-2M'], level: 'entry', everyH: 2, demo: false,
    purpose: 'Record 2M WFE / FSD distillation run (constraint asset): 2-hour checks, oil additions, distillate mass and potency.',
    governingSop: [SOP_DIST], recordModel: 'One record per 2M batch; one entry per 2-hour check row + oil additions + one close entry', demoLayout: true,
    sections: wfeSections(true), signoff: PERFORM_REVIEW_APPROVE,
    blockingRules: ['Vacuum > 0.05 mbar blocks submit until comment + deviation', 'D9 THC above limit forces batch HOLD (QA only can release)'],
    escalation: 'Same as FOR-BIP-009; constraint-asset downtime linked from entry',
  },
  {
    formNo: 'FOR-BIP-004', title: 'Isolation Log', revision: 'Rev. 7', effective: '2026-01-16', assets: ['L2-ISO-A', 'L2-ISO-B', 'L2-ISO-C', 'L2-ISO-D', 'L2-ISO-E'], level: 'batch', demo: false,
    purpose: 'Record CBD isolation: charge, each crash (up to 4), -18 degC endpoint, rinses, trays / oven, isolate mass, visual checks.',
    governingSop: [SOP_ISO], recordModel: 'One record per reactor batch; one crash block per crash (batch IDs ...-C1..C4)', demoLayout: true,
    sections: [
      { id: 'HEADER', title: 'Header', fields: [
        f('REACTOR', 'Reactor', 'select', 'system', 'Calculated', { options: ['ISO-A', 'ISO-B', 'ISO-C', 'ISO-D', 'ISO-E'] }),
        f('BATCH_ID', 'Isolation batch ID', 'id', 'genealogy', 'ERP', { help: 'Format ISO-X-YYMMDD-NN-Cn' }),
        f('INPUT_LOTS', 'Input distillate lot(s)', 'multiselect', 'genealogy', 'ERP'),
        f('INPUT_KG', 'Input mass', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 1 }),
      ] },
      { id: 'CHARGE', title: 'Solvent charge', fields: [
        f('HEP_CALC_L', 'Heptane charge - calculated', 'number', 'calc', 'Calculated', { unit: 'L', decimals: 1, rule: 'Input kg x 2.5 L/kg (demo factor)' }),
        f('HEP_ACT_L', 'Heptane charge - actual', 'number', 'manual', 'Manual', { unit: 'L', decimals: 1, rule: 'Within +/-2 % of calculated' }),
      ] },
      { id: 'CRASH', title: 'Crash', repeat: { min: 1, max: 4, label: 'Crash' }, fields: [
        f('CRASH_NO', 'Crash no.', 'number', 'system', 'Calculated', { decimals: 0, min: 1, max: 4 }),
        f('DISSOLVE_T', 'Dissolve temperature', 'number', 'live', 'Controller', { tag: 'T_INT', unit: 'degC', decimals: 1 }),
        time('DISSOLVE_TIME', 'Dissolve complete', 'milestone', 'Calculated'),
        time('COOL_START', 'Start cooling time', 'milestone', 'Calculated'),
        time('REACHED_M18', 'Time internal temp reached -18 degC', 'milestone', 'Controller', { tag: 'T_INT', limitRef: SOP_ISO, rule: 'First time T_INT <= -18.0 degC for 5 consecutive minutes' }),
        time('HOLD_START', 'Hold start', 'milestone', 'Calculated'),
        time('HOLD_END', 'Hold end', 'milestone', 'Calculated'),
        f('CRASH_END_T', 'Crash endpoint temperature', 'number', 'calc', 'Calculated', { unit: 'degC', decimals: 1, max: -18, limitRef: SOP_ISO, rule: 'Mean T_INT over last 30 min of HOLD' }),
        time('TRANSFER_TIME', 'Transfer / filter time'),
        f('RINSE1_L', 'Rinse 1 volume', 'number', 'manual', 'Manual', { unit: 'L', decimals: 1 }), time('RINSE1_TIME', 'Rinse 1 time'),
        f('RINSE2_L', 'Rinse 2 volume', 'number', 'manual', 'Manual', { unit: 'L', decimals: 1 }), time('RINSE2_TIME', 'Rinse 2 time'),
        f('RINSE3_L', 'Rinse 3 volume', 'number', 'manual', 'Manual', { unit: 'L', decimals: 1 }), time('RINSE3_TIME', 'Rinse 3 time'),
        f('FLUFF_MIX', 'Fluff / mix done', 'attest', 'manual', 'Manual'),
        time('TRAY_IN', 'Tray in time'), time('TRAY_OUT', 'Tray out time'),
        f('OVEN_ID', 'Vacuum oven', 'select', 'manual', 'Manual', { options: ['VO-01', 'VO-02'] }),
        f('ISOLATE_KG', 'Isolate mass out', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        f('YIELD_PCT', 'Crash yield', 'number', 'calc', 'Calculated', { unit: '%', decimals: 1, rule: 'Isolate kg / input kg x 100' }),
        f('VIS_COLOUR', 'Visual - colour', 'select', 'manual', 'Manual', { options: ['White', 'Off-white', 'Yellow'], help: 'Operator judgement per SOP - never automated' }),
        f('VIS_DRYNESS', 'Visual - dryness', 'select', 'manual', 'Manual', { options: ['Dry', 'Slightly damp', 'Wet'] }),
        f('VIS_CONDITION', 'Visual - material condition', 'select', 'manual', 'Manual', { options: ['Free-flowing crystals', 'Clumped', 'Glassy / oiled out'] }),
        sign(),
      ] },
      { id: 'NOTES', title: 'Notes / exceptions', fields: [
        f('DEV_REF', 'Deviation reference', 'link', 'manual', 'Manual', opt()),
        f('NOTES', 'Notes', 'longtext', 'manual', 'Manual', opt()),
      ] },
    ],
    signoff: PERFORM_REVIEW_APPROVE,
    blockingRules: ['Crash endpoint > -18 degC blocks close until deviation raised (Critical)', 'Visual fields cannot be auto-filled', 'Yellow isolate forces Quality Loss record QL2-07'],
    escalation: 'Critical deviation: Operator + Supervisor + QA at T+0; Production Manager @ 15 min unacknowledged',
  },
  {
    formNo: 'FOR-BIP-003', title: 'D8 Log', revision: 'Rev. 4', effective: '2026-02-05', assets: ['L2-RXN-1', 'L2-RXN-3'], level: 'batch', demo: false,
    purpose: 'Record Delta-8 conversion: recipe, pre-acid temperature, acid addition, exotherm, cook in band, three washes, output.',
    governingSop: [SOP_D8], recordModel: 'One record per reaction batch (D8-YYMMDD-NN)', demoLayout: true,
    sections: [
      { id: 'HEADER', title: 'Header', fields: [
        f('REACTION_ID', 'Reaction ID', 'id', 'genealogy', 'ERP', { help: 'Format D8-YYMMDD-NN' }),
        f('REACTOR', 'Reactor', 'select', 'system', 'Calculated', { options: ['RXN-1', 'RXN-3'] }),
        f('INPUT_LOTS', 'Input isolate lot(s)', 'multiselect', 'genealogy', 'ERP'),
        f('INPUT_KG', 'Input mass', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
      ] },
      { id: 'RECIPE', title: 'Recipe (guided)', fields: [
        f('HEP_CALC_L', 'Heptane - calculated', 'number', 'calc', 'Calculated', { unit: 'L', decimals: 1, rule: 'Input kg x 4.0 L/kg (demo factor per ' + SOP_D8 + ')' }),
        f('HEP_ACT_L', 'Heptane - actual', 'number', 'manual', 'Manual', { unit: 'L', decimals: 1 }),
        f('ACID_CALC_KG', 'Acid - calculated', 'number', 'calc', 'Calculated', { unit: 'kg', decimals: 3, rule: 'Input kg x 0.05 (demo factor per ' + SOP_D8 + ')' }),
        f('ACID_ACT_KG', 'Acid - actual', 'number', 'manual', 'Manual', { unit: 'kg', decimals: 3, rule: 'Within +/-2 % of calculated' }),
      ] },
      { id: 'MILESTONES', title: 'Reaction milestones', fields: [
        time('MATERIAL_IN', 'Material-in time', 'milestone', 'Calculated'),
        f('PRE_ACID_T', 'Pre-acid temperature', 'number', 'live', 'Controller', { tag: 'T_INT', unit: 'degC', decimals: 1, min: 50, max: 55, limitRef: SOP_D8 }),
        time('ACID_IN', 'Acid-in time (attest)', 'manual', 'Manual'),
        f('ACID_ATTEST', 'Acid addition performed per SOP', 'attest', 'manual', 'Manual'),
        f('EXO_PEAK_T', 'Exotherm peak temperature', 'number', 'milestone', 'Calculated', { unit: 'degC', decimals: 1, max: 78, rule: 'Max T_INT in EXOTHERM phase' }),
        time('EXO_PEAK_TIME', 'Exotherm peak time', 'milestone', 'Calculated'),
        f('EXO_RISE', 'Exotherm rise', 'number', 'calc', 'Calculated', { unit: 'degC', decimals: 1, rule: 'Peak - pre-acid temperature' }),
        f('EXO_TTP', 'Time to peak', 'number', 'calc', 'Calculated', { unit: 'min', decimals: 0 }),
        f('SET_TEMP', 'Cook set temperature', 'number', 'live', 'Controller', { unit: 'degC', decimals: 1, target: 90 }),
        time('COOK_START', 'Cook start', 'milestone', 'Calculated'), time('COOK_END', 'Cook end', 'milestone', 'Calculated'),
        f('COOK_IN_BAND', 'Cook time in 85-95 degC band', 'number', 'calc', 'Calculated', { unit: '%', decimals: 1, min: 95, limitRef: SOP_D8, rule: 'Minutes with 85 <= T_INT <= 95 / cook minutes x 100' }),
      ] },
      { id: 'WASH', title: 'Wash', repeat: { min: 3, max: 3, label: 'Wash' }, fields: [
        f('WASH_NO', 'Wash no.', 'number', 'system', 'Calculated', { decimals: 0 }),
        f('WASH_DONE', 'Wash performed', 'attest', 'manual', 'Manual'),
        f('WASH_PH', 'Aqueous pH', 'number', 'manual', 'Manual', { unit: 'pH', decimals: 1, min: 6.5, max: 8, limitRows: [3], help: 'Limit applies to wash 3' }),
        time('WASH_TIME', 'Wash time'),
        sign(),
      ] },
      { id: 'CLOSE', title: 'Close', fields: [
        f('OUTPUT_KG', 'Output mass', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        f('YIELD_PCT', 'Yield', 'number', 'calc', 'Calculated', { unit: '%', decimals: 1 }),
        f('NOTES', 'Notes', 'longtext', 'manual', 'Manual', opt()),
        sign(),
      ] },
    ],
    signoff: PERFORM_REVIEW_APPROVE,
    blockingRules: ['Pre-acid temperature outside 50-55 degC blocks acid-in attest (Major deviation)', 'Cook in-band < 95 % requires comment', 'All 3 washes mandatory before close'],
    escalation: 'Major deviation: Operator, Supervisor @ 15 min, QA @ 1 h, Production Manager @ 4 h',
  },
  {
    formNo: 'FOR-KRT-101', title: 'Extraction Cycle Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-EXT-T01', 'L1-EXT-T02', 'L1-EXT-T03', 'L1-EXT-T04'], level: 'batch', demo: true,
    purpose: 'One extraction cycle on the outdoor pad: charge, PLC step times, liquor temp/pH, drain and totes filled.',
    governingSop: ['OBX kratom extraction work instruction (number TBC)'], recordModel: 'One record per extraction cycle (KX-Txx-YYMMDD-n)', demoLayout: true,
    sections: [
      { id: 'HEADER', title: 'Header', fields: [
        f('CYCLE_ID', 'Extraction cycle ID', 'id', 'genealogy', 'ERP'),
        f('TANK', 'Extraction tank', 'select', 'system', 'Calculated', { options: ['T01', 'T02', 'T03', 'T04'] }),
        f('BIOMASS_LOT', 'Biomass lot', 'scan', 'genealogy', 'ERP'),
        f('CHARGE_KG', 'Biomass charge', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 1 }),
      ] },
      { id: 'STEPS', title: 'PLC step times', fields: [
        time('FILL_START', 'Fill start', 'milestone', 'PLC'), time('SOAK_START', 'Soak start', 'milestone', 'PLC'),
        time('RECIRC_START', 'Recirculation start', 'milestone', 'PLC'), time('DRAIN_START', 'Drain start', 'milestone', 'PLC'),
        time('DRAIN_END', 'Drain end', 'milestone', 'PLC'),
        f('CYCLE_H', 'Cycle time', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 2, target: 8 }),
      ] },
      { id: 'PROCESS', title: 'Liquor', fields: [
        f('LIQ_TEMP', 'Liquor temperature (recirc avg)', 'number', 'live', 'PLC', { tag: 'TEMP', unit: 'degC', decimals: 1, min: 55, max: 65 }),
        f('LIQ_PH', 'Liquor pH (end of recirc)', 'number', 'live', 'PLC', { tag: 'PH', unit: 'pH', decimals: 2, min: 3, max: 4 }),
        f('RECIRC_FLOW', 'Recirculation flow (avg)', 'number', 'live', 'PLC', { tag: 'RECIRC_FLOW', unit: 'L/min', decimals: 0, min: 150, max: 210 }),
        f('DRAIN_L', 'Drain volume', 'number', 'calc', 'PLC', { unit: 'L', decimals: 0, rule: 'Level delta x tank volume' }),
        f('TOTE_IDS', 'Totes filled', 'scan', 'manual', 'Manual'),
        f('DISC_MIN', 'Edge data gap back-filled', 'number', 'system', 'Calculated', opt({ unit: 'min', decimals: 0, help: 'Outdoor-pad network loss; values back-filled from I/O Connect buffer' })),
      ] },
      { id: 'CLOSE', title: 'Close', fields: [
        f('WEATHER_HOLD', 'Weather hold during cycle', 'boolean', 'manual', 'Manual'),
        f('WEATHER_REASON', 'Weather hold reason', 'select', 'manual', 'Manual', opt({ options: ['Lightning', 'Freeze', 'High wind', 'Heavy rain'] })),
        f('NOTES', 'Notes', 'longtext', 'manual', 'Manual', opt()),
        sign(),
      ] },
    ],
    signoff: PERFORM_REVIEW_APPROVE.slice(0, 2),
    blockingRules: ['Liquor pH outside 3.0-4.0 requires comment (QL1-03 rework)'],
    escalation: 'Edge DISC > 10 min: OBX IT/OT + Faclon support, Supervisor @ 30 min',
  },
  {
    formNo: 'FOR-KRT-102', title: 'LLE / Solvent Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-LLE-01', 'L1-SRU-01'], level: 'entry', everyH: 4, demo: true,
    purpose: 'Liquid-liquid extraction and heptane recovery readings every 4 h - feeds the heptane-loss-per-kg-MIT KPI.',
    governingSop: ['OBX LLE / solvent recovery work instruction (number TBC)'], recordModel: 'One entry every 4 h while LLE is in CONTACT', demoLayout: true,
    sections: [
      { id: 'LLE', title: 'LLE skid', fields: [
        time('CHECK_TIME', 'Check time', 'system', 'Calculated'),
        f('LLE_BATCH', 'LLE campaign', 'id', 'genealogy', 'ERP'),
        live('ORG_FLOW', 'Organic (heptane) flow', 'ORG_FLOW', 'L/min', { min: 18, max: 26 }),
        live('AQ_FLOW', 'Aqueous flow', 'AQ_FLOW', 'L/min', { min: 34, max: 46 }),
        f('OA_RATIO', 'O/A ratio', 'number', 'calc', 'Calculated', { decimals: 2, min: 0.45, max: 0.6, rule: 'Organic flow / aqueous flow' }),
        live('AQ_PH', 'Aqueous pH', 'AQ_PH', 'pH', { decimals: 2, min: 9.4, max: 10.2 }),
        f('INTERFACE', 'Interface observation', 'select', 'manual', 'Manual', { options: ['Sharp', 'Rag layer < 1 cm', 'Rag layer > 1 cm'] }),
        f('EMULSION', 'Emulsion present', 'boolean', 'manual', 'Manual'),
        f('HEP_IN_L', 'Heptane to LLE (since last check)', 'number', 'calc', 'Controller', { unit: 'L', decimals: 0, rule: 'Totaliser delta' }),
      ] },
      { id: 'SRU', title: 'Solvent recovery', fields: [
        f('REB_TEMP', 'Reboiler temperature', 'number', 'live', 'Controller', { tag: 'REB_TEMP', unit: 'degC', decimals: 1, min: 97, max: 104, appliesTo: ['L1-SRU'] }),
        f('COND_OUT', 'Condenser outlet temperature', 'number', 'live', 'Controller', { tag: 'COND_OUT', unit: 'degC', decimals: 1, max: 30, appliesTo: ['L1-SRU'] }),
        f('HEP_REC_L', 'Heptane recovered (since last check)', 'number', 'calc', 'Controller', { unit: 'L', decimals: 0 }),
        f('HEP_T01_PCT', 'Heptane tank HEP-T01 level', 'number', 'manual', 'Manual', { unit: '%', decimals: 0 }),
        f('HEP_T02_PCT', 'Heptane tank HEP-T02 level', 'number', 'manual', 'Manual', { unit: '%', decimals: 0 }),
        f('REC_PURITY', 'Recovered heptane purity', 'number', 'manual', 'Manual', { unit: '%', decimals: 1, min: 98 }),
        sign(),
      ] },
    ],
    signoff: PERFORM_REVIEW_APPROVE.slice(0, 2),
    blockingRules: ['Emulsion = Yes requires Quality Loss QL1-04 or comment', 'Condenser outlet > 30 degC raises Minor deviation (solvent slip)'],
    escalation: 'Heptane loss > target for lot: Production Manager on lot close; Plant Head weekly digest',
  },
  {
    formNo: 'FOR-KRT-103', title: 'Crystallization Batch Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-CRY-01', 'L1-CRY-02', 'L1-FIL-01'], level: 'batch', demo: true,
    purpose: 'MIT freebase crystallization (pH dose, cool, hold) and Nutsche filtration / drying.',
    governingSop: ['OBX crystallization work instruction (number TBC)'], recordModel: 'Crystallization section per MCB batch; Filter/dry section per MFD batch (linked by genealogy)', demoLayout: true,
    sections: [
      { id: 'CRYST', title: 'Crystallization', appliesTo: ['L1-CRY'], fields: [
        f('BATCH_ID', 'Crystallization batch', 'id', 'genealogy', 'ERP', { help: 'Format MCB-26-nnnn' }),
        f('CRYSTALLIZER', 'Crystallizer', 'select', 'system', 'Calculated', { options: ['CRY-01', 'CRY-02'] }),
        f('SOURCE', 'Source LLE campaign(s) / totes', 'multiselect', 'genealogy', 'ERP'),
        f('CHARGE_KG', 'Organic phase charged (MIT equiv.)', 'number', 'calc', 'Calculated', { unit: 'kg', decimals: 1 }),
        time('DOSE_START', 'Base dose start', 'milestone', 'Controller'),
        time('PH_REACHED', 'pH 9.3 reached', 'milestone', 'Controller', { tag: 'PH', rule: 'PH >= 9.3 for 5 consecutive minutes' }),
        f('BASE_RECIPE_L', 'Base - recipe volume', 'number', 'calc', 'Calculated', { unit: 'L', decimals: 1 }),
        f('BASE_DOSED_L', 'Base - dosed total', 'number', 'calc', 'Controller', { unit: 'L', decimals: 1, rule: 'Integral of DOSE_RATE' }),
        f('FINAL_PH', 'Final pH', 'number', 'live', 'Controller', { tag: 'PH', unit: 'pH', decimals: 2, min: 9.3, max: 9.9 }),
        f('T_HOLD', 'Temperature at hold', 'number', 'live', 'Controller', { tag: 'T_INT', unit: 'degC', decimals: 1, min: 2, max: 8 }),
        time('HOLD_START', 'Hold start', 'milestone', 'Calculated'), time('HOLD_END', 'Hold end', 'milestone', 'Calculated'),
        f('HOLD_H', 'Hold duration', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 2, min: 3.5, max: 6 }),
        f('CRYSTAL_APPEAR', 'Crystal appearance', 'select', 'manual', 'Manual', { options: ['Pale, granular', 'Fine / slow settling', 'Dark / off-colour'] }),
        f('YIELD_PCT', 'Crystallization yield', 'number', 'calc', 'Calculated', { unit: '%', decimals: 1 }),
        sign(),
      ] },
      { id: 'FILTER', title: 'Filtration & drying (Nutsche)', appliesTo: ['L1-FIL'], fields: [
        f('FD_BATCH', 'Filter-dryer batch', 'id', 'genealogy', 'ERP', { help: 'Format MFD-26-nnnn' }),
        f('SOURCE', 'Source crystallization batch(es)', 'multiselect', 'genealogy', 'ERP'),
        time('FILT_START', 'Filtration start', 'milestone', 'Calculated'), time('FILT_END', 'Filtration end', 'milestone', 'Calculated'),
        f('FILT_MIN', 'Filtration duration', 'number', 'calc', 'Calculated', { unit: 'min', decimals: 0, max: 150 }),
        f('DP_MAX', 'Max filter differential pressure', 'number', 'live', 'Controller', { unit: 'bar', decimals: 2, max: 1.5 }),
        f('WASH_L', 'Heptane cake wash', 'number', 'manual', 'Manual', { unit: 'L', decimals: 1 }),
        f('DRY_TEMP', 'Drying temperature (avg)', 'number', 'live', 'Controller', { unit: 'degC', decimals: 1, min: 40, max: 50 }),
        f('DRY_H', 'Drying time', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 1 }),
        f('LOD', 'Loss on drying', 'number', 'lims', 'LIMS/COA', { unit: '%', decimals: 2, max: 0.5 }),
        f('DRY_KG', 'Dry freebase out', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        sign(),
      ] },
    ],
    signoff: PERFORM_REVIEW_APPROVE,
    blockingRules: ['Final pH outside 9.3-9.9 requires deviation (links pH-probe calibration LOG-CAL)', 'LOD > 0.5 % blocks drumming (QL1-08 rework)'],
    escalation: 'Major deviation path; batch record review pending: Supervisor @ close+4 h, QA @ +24 h',
  },
  {
    formNo: 'FOR-KRT-104', title: 'Drum & Weigh Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-FIL-01'], level: 'event', demo: true,
    purpose: 'Each MIT freebase drum: scan, gross / tare / net from connected scale, label and seal check.',
    governingSop: ['OBX drumming & labelling work instruction (number TBC)'], recordModel: 'One entry per drum (FBD-26-nnnn)', demoLayout: true,
    sections: [
      { id: 'DRUM', title: 'Drum', fields: [
        f('DRUM_ID', 'Drum ID', 'scan', 'manual', 'Manual', { help: 'Format FBD-26-nnnn' }),
        f('SOURCE_BATCH', 'Source filter-dryer batch', 'id', 'genealogy', 'ERP'),
        f('GROSS_KG', 'Gross weight', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        f('TARE_KG', 'Tare weight', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        f('NET_KG', 'Net weight', 'number', 'calc', 'Calculated', { unit: 'kg', decimals: 2, rule: 'Gross - tare; must match label within +/-0.05 kg' }),
        f('SEAL_NO', 'Seal number', 'text', 'manual', 'Manual'),
        f('LABEL_CHECK', 'Label matches drum, batch and net weight', 'attest', 'manual', 'Manual'),
        f('PHOTO', 'Label photo', 'photo', 'manual', 'Manual', opt()),
        sign(),
      ] },
    ],
    signoff: [{ step: 'Perform', role: 'Operator', meaning: 'Weighed and labelled' }, { step: 'Verify', role: 'Shift Supervisor', meaning: 'Second-person verification of label' }],
    blockingRules: ['Drum not linked to a released MFD batch cannot be saved (QL1-11 genealogy mismatch)'],
    escalation: 'Genealogy mismatch: QA + Plant Head at T+0',
  },
  {
    formNo: 'FOR-KRT-105', title: 'Salt Run Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-SLT-01', 'L1-SDR-01'], level: 'batch', demo: true,
    purpose: 'MIT acetate salt formation and vacuum drying.',
    governingSop: ['OBX salt formation work instruction (number TBC)'], recordModel: 'Salt section per MAS run; Dry section per MSD run', demoLayout: true,
    sections: [
      { id: 'SALT', title: 'Salt formation', appliesTo: ['L1-SLT'], fields: [
        f('RUN_ID', 'Salt run ID', 'id', 'genealogy', 'ERP', { help: 'Format MAS-26-nnnn' }),
        f('DRUMS', 'Freebase drums consumed', 'multiselect', 'manual', 'Manual', { help: 'Scan each drum' }),
        f('FB_KG', 'Freebase charged', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        f('ACID_CALC_KG', 'Acetic acid - calculated', 'number', 'calc', 'Calculated', { unit: 'kg', decimals: 2, rule: 'Freebase kg x 0.151 (stoichiometric, demo)' }),
        f('ACID_ACT_KG', 'Acetic acid - actual', 'number', 'manual', 'Manual', { unit: 'kg', decimals: 2, rule: 'Within +/-2 %' }),
        f('T_REACT', 'Reaction temperature (avg)', 'number', 'live', 'Controller', { tag: 'T_INT', unit: 'degC', decimals: 1, min: 40, max: 50 }),
        f('PH_END', 'Final pH', 'number', 'manual', 'Manual', { unit: 'pH', decimals: 2, min: 4.6, max: 5.4 }),
        f('WET_KG', 'Salt output (wet)', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        sign(),
      ] },
      { id: 'DRY', title: 'Vacuum drying', appliesTo: ['L1-SDR'], fields: [
        f('DRY_ID', 'Dryer run ID', 'id', 'genealogy', 'ERP', { help: 'Format MSD-26-nnnn' }),
        f('DRY_TEMP', 'Dryer temperature (avg)', 'number', 'live', 'Controller', { unit: 'degC', decimals: 1, min: 45, max: 55 }),
        f('DRY_VAC', 'Dryer vacuum (avg)', 'number', 'live', 'Controller', { unit: 'mbar', decimals: 0, max: 60 }),
        f('DRY_H', 'Drying time', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 1 }),
        f('LOD', 'Loss on drying', 'number', 'lims', 'LIMS/COA', { unit: '%', decimals: 2, max: 0.5 }),
        f('ASSAY', 'MIT acetate assay', 'number', 'lims', 'LIMS/COA', { unit: '%', decimals: 1, min: 98 }),
        f('DRY_KG', 'Dry salt out', 'number', 'scale', 'Scale', { unit: 'kg', decimals: 2 }),
        sign(),
      ] },
    ],
    signoff: PERFORM_REVIEW_APPROVE,
    blockingRules: ['Assay < 98.0 % forces Quality Loss QL1-12', 'Final pH out of range requires comment'],
    escalation: 'Batch record review pending: Supervisor @ close+4 h, QA @ +24 h, PM @ +72 h',
  },
  {
    formNo: 'LOG-SHIFT', title: 'Shift Handover', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: [], level: 'shift', demo: true,
    purpose: 'Per-line shift handover: auto summary from I/O Sense plus supervisor notes; signed by outgoing and incoming supervisor.',
    governingSop: ['Demo format'], recordModel: 'One record per line per shift', demoLayout: false,
    sections: [
      { id: 'AUTO', title: 'Auto summary (read-only)', fields: [
        f('LINE', 'Line', 'select', 'system', 'Calculated', { options: ['L1', 'L2'] }),
        f('SHIFT', 'Shift', 'select', 'system', 'Calculated', { options: ['A', 'B'] }),
        f('RUN_H', 'Constraint run time', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 1 }),
        f('UNPLANNED_H', 'Unplanned downtime (all assets)', 'number', 'calc', 'Calculated', { unit: 'h', decimals: 1 }),
        f('TOP_DT', 'Top 3 downtime reasons', 'longtext', 'calc', 'Calculated'),
        f('UNTAGGED', 'Untagged stops', 'number', 'calc', 'Calculated', { decimals: 0, max: 0 }),
        f('QL_KG', 'Quality loss', 'number', 'calc', 'Calculated', { unit: 'kg', decimals: 1 }),
        f('OPEN_DEV', 'Open deviations', 'number', 'calc', 'Calculated', { decimals: 0 }),
        f('BATCHES_WIP', 'Batches in progress', 'longtext', 'calc', 'Calculated'),
      ] },
      { id: 'NOTES', title: 'Supervisor notes', fields: [
        f('SAFETY', 'Safety observations', 'longtext', 'manual', 'Manual', { editableBy: ['Shift Supervisor'] }),
        f('NOTES', 'Handover notes', 'longtext', 'manual', 'Manual', { editableBy: ['Shift Supervisor'] }),
        f('ACTIONS', 'Pending actions', 'longtext', 'manual', 'Manual', opt({ editableBy: ['Shift Supervisor'] })),
        f('OUT_SIGN', 'Outgoing supervisor (e-sign)', 'esign', 'manual', 'Manual', { editableBy: ['Shift Supervisor'] }),
        f('IN_SIGN', 'Incoming supervisor (e-sign)', 'esign', 'manual', 'Manual', { editableBy: ['Shift Supervisor'] }),
      ] },
    ],
    signoff: [{ step: 'Perform', role: 'Shift Supervisor', meaning: 'Outgoing handover' }, { step: 'Review', role: 'Shift Supervisor', meaning: 'Incoming acceptance' }],
    blockingRules: ['Cannot sign while untagged stops > 0 on the shift unless each is acknowledged'],
    escalation: 'Untagged downtime at shift end: Supervisor @ shift end + 30 min',
  },
  {
    formNo: 'LOG-EQ-DAILY', title: 'Daily Equipment Checklist', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: [], level: 'day', demo: true,
    purpose: 'Daily per-asset condition checks. Items shown depend on asset type; photo required on fail.',
    governingSop: ['Demo format'], recordModel: 'One record per asset per shift', demoLayout: false,
    sections: [
      { id: 'CHECKS', title: 'Checks', fields: [
        f('VP_OIL', 'Vacuum pump oil level / colour', 'passfail', 'manual', 'Manual', { appliesTo: ['L2-WFE', 'L2-VO', 'L1-SDR', 'L1-FIL'] }),
        f('CHL_GLYCOL', 'Chiller glycol level', 'passfail', 'manual', 'Manual', { appliesTo: ['L2-WFE', 'L2-ISO', 'L1-CRY'] }),
        f('COLD_TRAP', 'Cold trap condition', 'passfail', 'manual', 'Manual', { appliesTo: ['L2-WFE'] }),
        f('WIPER_NOISE', 'Wiper / rotor noise & vibration', 'passfail', 'manual', 'Manual', { appliesTo: ['L2-WFE'] }),
        f('PH_BUFFER', 'pH probe buffer verification (pH 7 / 10)', 'passfail', 'manual', 'Manual', { appliesTo: ['L1-CRY', 'L1-LLE', 'L1-EXT'] }),
        f('SCALE_VERIF', 'Scale verification weight', 'passfail', 'manual', 'Manual', { appliesTo: ['L1-FIL', 'L2-BUF'] }),
        f('AGIT', 'Agitator noise / seal', 'passfail', 'manual', 'Manual', { appliesTo: ['L2-ISO', 'L2-RXN', 'L1-CRY', 'L1-SLT'] }),
        f('LEAKS', 'Leaks (solvent / utility)', 'passfail', 'manual', 'Manual'),
        f('HOUSEKEEPING', 'Housekeeping', 'passfail', 'manual', 'Manual'),
        f('PHOTO', 'Photo of failed item', 'photo', 'manual', 'Manual', opt({ help: 'Required when any item = Fail' })),
        f('REMARKS', 'Remarks', 'longtext', 'manual', 'Manual', opt()),
        sign(),
      ] },
    ],
    signoff: [{ step: 'Perform', role: 'Operator', meaning: 'Checks performed' }, { step: 'Review', role: 'Shift Supervisor', meaning: 'Reviewed' }],
    blockingRules: ['Any Fail requires photo + remark and creates a maintenance request'],
    escalation: 'Daily checklist not done: Operator @ shift end, Supervisor @ +1 h, Production Manager @ +24 h',
  },
  {
    formNo: 'LOG-CAL', title: 'Calibration Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: [], level: 'event', demo: true,
    purpose: 'Instrument calibration / verification events (pH probes, RTDs, vacuum gauges, scales).',
    governingSop: ['Demo format'], recordModel: 'One record per calibration event', demoLayout: false,
    sections: [
      { id: 'CAL', title: 'Calibration', fields: [
        f('INSTRUMENT', 'Instrument / tag', 'text', 'manual', 'Manual'),
        f('ASSET', 'Asset', 'text', 'manual', 'Manual'),
        f('STANDARD', 'Reference standard ID', 'text', 'manual', 'Manual'),
        f('AS_FOUND', 'As-found reading', 'number', 'manual', 'Manual', { decimals: 3 }),
        f('AS_LEFT', 'As-left reading', 'number', 'manual', 'Manual', { decimals: 3 }),
        f('REFERENCE', 'Reference value', 'number', 'manual', 'Manual', { decimals: 3 }),
        f('TOLERANCE', 'Tolerance (+/-)', 'number', 'manual', 'Manual', { decimals: 3 }),
        f('RESULT', 'Result', 'passfail', 'calc', 'Calculated', { rule: '|as-found - reference| <= tolerance' }),
        f('NEXT_DUE', 'Next due', 'datetime', 'calc', 'Calculated'),
        f('TECH', 'Technician (e-sign)', 'esign', 'manual', 'Manual'),
      ] },
    ],
    signoff: [{ step: 'Perform', role: 'Operator', meaning: 'Calibrated' }, { step: 'Approve', role: 'QA', meaning: 'Calibration accepted' }],
    blockingRules: ['As-found fail triggers impact assessment on batches since last pass (links deviations)'],
    escalation: 'As-found fail: QA at T+0',
  },
  {
    formNo: 'LOG-SOLV', title: 'Solvent Inventory (L1 heptane)', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-SRU-01'], level: 'day', demo: true,
    purpose: 'Daily heptane reconciliation: opening/closing tank levels, receipts, transfers, recovered, calculated loss per kg MIT.',
    governingSop: ['Demo format'], recordModel: 'One record per production day', demoLayout: false,
    sections: [
      { id: 'BAL', title: 'Heptane balance', fields: [
        f('DAY', 'Production day', 'datetime', 'system', 'Calculated'),
        f('OPEN_L', 'Opening inventory (HEP-T01 + T02)', 'number', 'manual', 'Manual', { unit: 'L', decimals: 0 }),
        f('RECEIPT_L', 'Fresh receipts', 'number', 'erp', 'ERP', { unit: 'L', decimals: 0 }),
        f('RECOVERED_L', 'Recovered (SRU totaliser)', 'number', 'calc', 'Controller', { unit: 'L', decimals: 0 }),
        f('TO_LLE_L', 'Issued to LLE', 'number', 'calc', 'Controller', { unit: 'L', decimals: 0 }),
        f('TO_WASH_L', 'Issued to crystallization / cake wash', 'number', 'manual', 'Manual', { unit: 'L', decimals: 0 }),
        f('CLOSE_L', 'Closing inventory', 'number', 'manual', 'Manual', { unit: 'L', decimals: 0 }),
        f('LOSS_L', 'Calculated loss', 'number', 'calc', 'Calculated', { unit: 'L', decimals: 0, rule: 'Issued to LLE + wash - recovered (tank gap reported separately)' }),
        f('MIT_KG', 'MIT freebase produced', 'number', 'calc', 'Calculated', { unit: 'kg', decimals: 1 }),
        f('LOSS_PER_KG', 'Heptane loss per kg MIT', 'number', 'calc', 'Calculated', { unit: 'L/kg', decimals: 2, max: 4.0 }),
        sign(),
      ] },
    ],
    signoff: [{ step: 'Perform', role: 'Operator', meaning: 'Levels read' }, { step: 'Review', role: 'Production Manager', meaning: 'Reconciliation reviewed' }],
    blockingRules: ['Loss per kg above target requires comment'],
    escalation: 'Heptane loss > target: Production Manager on lot close',
  },
  {
    formNo: 'LOG-CLEAN', title: 'Cleaning / Changeover', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: [], level: 'event', demo: true,
    purpose: 'Equipment cleaning and product changeover with release to next batch.',
    governingSop: ['Demo format'], recordModel: 'One record per CLEAN phase / changeover', demoLayout: false,
    sections: [
      { id: 'CLEAN', title: 'Cleaning', fields: [
        f('ASSET', 'Asset', 'text', 'system', 'Calculated'),
        f('PREV_BATCH', 'Previous batch', 'id', 'genealogy', 'ERP'),
        f('PREV_PRODUCT', 'Previous product', 'text', 'genealogy', 'ERP'),
        f('METHOD', 'Cleaning method', 'select', 'manual', 'Manual', { options: ['Heptane flush', 'Ethanol rinse', 'Hot water + detergent', 'Dry wipe-down'] }),
        time('START', 'Start', 'milestone', 'Calculated'), time('END', 'End', 'milestone', 'Calculated'),
        f('VISUAL_CLEAN', 'Visually clean', 'attest', 'manual', 'Manual'),
        sign(),
        f('RELEASED_BY', 'Released for next batch (e-sign)', 'esign', 'manual', 'Manual', { editableBy: ['Shift Supervisor'] }),
      ] },
    ],
    signoff: [{ step: 'Perform', role: 'Operator', meaning: 'Cleaned' }, { step: 'Verify', role: 'Shift Supervisor', meaning: 'Released' }],
    blockingRules: ['Next batch cannot start on the asset until RELEASED_BY is signed'],
    escalation: 'None (informational)',
  },
];

export const formByNo = (no: string) => FORMS.find(x => x.formNo === no);

// ------------------------------------------------------------------ entry builder
type Field = LogbookEntry['fields'][number];
type DS = DemoDataset;
const MIN = 60_000, H = 3_600_000;
const iso = (t: number | null | undefined) => (t == null ? null : new Date(t).toISOString());
const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
/** deterministic 0..1 from a string (does not touch generator RNG) */
const h01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const between = (s: string, a: number, b: number) => a + (b - a) * h01(s);
const pickS = <T,>(s: string, xs: T[]) => xs[Math.floor(h01(s) * xs.length) % xs.length];

function field(def: FormField, value: Field['value'], section: string, row?: number): Field & { section: string; row?: number } {
  let out = false;
  const rowOk = !def.limitRows || (row !== undefined && def.limitRows.includes(row));
  if (typeof value === 'number' && rowOk) out = (def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max);
  if (def.type === 'passfail' && value === 'Fail') out = true;
  return { key: def.key, label: def.label, value, unit: def.unit, source: def.source, outOfLimit: out, section, ...(row ? { row } : {}) };
}

/** Fill one section. `vals` maps field key -> value; missing keys become null (renders as empty / due). */
function fillSection(form: FormDef, sectionId: string, vals: Record<string, Field['value']>, row?: number, assetId?: string): Field[] {
  const s = form.sections.find(x => x.id === sectionId)!;
  return s.fields
    .filter(d => !d.appliesTo || !assetId || d.appliesTo.some(p => assetId.startsWith(p)))
    .map(d => field(d, vals[d.key] ?? null, sectionId, row));
}

const phase = (b: Batch, name: string) => b.phases.find(p => p.name === name);
const done = (st: LogbookEntry['status']) => st !== 'Due' && st !== 'Overdue';

export function enrichLogbooks(ds: DS): DS {
  const now = ds.meta.to;
  const va = (a: string, k: string, t: number, d = 1) => r(valueAt(ds, a, k, Math.min(t, now - 1)), d);
  const byId = new Map(ds.batches.map(b => [b.id, b]));
  const entries: LogbookEntry[] = [];
  let n = 0;
  const statusFor = (due: number, key: string): LogbookEntry['status'] => {
    const age = now - due, x = h01(key);
    if (age < 0) return 'Due';
    if (age < 30 * MIN) return x < 0.5 ? 'Submitted' : 'Due';
    if (age < 12 * H) return x < 0.06 ? 'Overdue' : x < 0.6 ? 'Reviewed' : 'Submitted';
    return x < 0.015 ? 'Returned' : 'Approved';
  };
  const people = (st: LogbookEntry['status'], sh: ShiftId, key: string, approver: string = PEOPLE.qa) => ({
    operator: done(st) ? pickS(key, PEOPLE[sh].ops) : null,
    reviewer: st === 'Reviewed' || st === 'Approved' ? PEOPLE[sh].sup : null,
    approver: st === 'Approved' ? approver : null,
  });
  const push = (e: Omit<LogbookEntry, 'id'>) => entries.push({ id: `LB-${String(++n).padStart(6, '0')}`, ...e });
  const since = now - 7 * 24 * H;

  // ---- keep existing 2-hour WFE checks and daily checklist (story), but re-shape their fields to the schema
  for (const e of ds.logbookEntries) {
    if (e.formNo === 'FOR-BIP-009' || e.formNo === 'FOR-BIP-010') {
      const form = formByNo(e.formNo)!; const a = e.assetId; const t = e.dueAt;
      const pv = (k: string, d = 1) => (t <= now ? va(a, k, t, d) : null);
      const setp = form.sections.find(s => s.id === 'CHECK')!.fields;
      const SP = (k: string) => setp.find(x => x.key === k)!.target!;
      const b = e.batchId ? byId.get(e.batchId) : undefined;
      const vals: Record<string, Field['value']> = {
        CHECK_TIME: iso(t), WIPER_SP: SP('WIPER_SP'), WIPER_PV: pv('WIPER_PV', 0), FEED_SP: SP('FEED_SP'), FEED_PV: pv('FEED_PV', 2),
        RUNOFF: done(e.status) ? (a === 'L2-WFE-2M' && (pv('VAC_PV', 3) ?? 0) > 0.05 ? 'Slow flow' : 'Steady flow') : null, RUNOFF_TARGET: 'Steady flow',
        VAC_PV: pv('VAC_PV', 3), EVAP_SP: SP('EVAP_SP'), EVAP_PV: pv('EVAP_PV'), COND_SP: SP('COND_SP'), COND_PV: pv('COND_PV'),
        CHL_SP: SP('CHL_SP'), CHL_PV: pv('CHL_PV'), ACK: done(e.status) ? true : null, INITIALS: e.operator,
      };
      const idx = Math.max(1, Math.round((t - (b?.start ?? t)) / (2 * H)));
      const fields = [
        ...fillSection(form, 'HEADER', { BATCH_ID: e.batchId, INPUT_LOTS: inputLots(ds, b), ASSET: a, START_TIME: iso(phase(b ?? ({ phases: [] } as unknown as Batch), 'STEADY FEED')?.start) }),
        ...fillSection(form, 'CHECK', vals, idx),
      ];
      const ool = fields.some(x => x.outOfLimit);
      const dev = ool ? ds.deviations.find(d => d.assetId === a && d.start <= t + 30 * MIN && (d.end ?? now) >= t) : undefined;
      const dt = ool ? ds.events.find(ev => ev.assetId === a && ev.state === 'DOWN' && ev.start <= t && (ev.end ?? now) > t) : undefined;
      fields.push(...fillSection(form, 'EXCEPTIONS', { DEV_REF: dev?.id ?? null, COMMENTS: ool && done(e.status) ? (dt ? `Asset down (${dt.reasonCode ?? 'U000'}) at check time - values not representative of steady feed. Linked downtime ${dt.id}.` : 'Excursion noted; supervisor informed.') : null }));
      entries.push({ ...e, fields: fields as Field[] });
    } else if (e.formNo === 'LOG-EQ-DAILY') {
      const form = formByNo('LOG-EQ-DAILY')!; const miss = !done(e.status);
      const vals: Record<string, Field['value']> = { VP_OIL: miss ? null : 'Pass', CHL_GLYCOL: miss ? null : 'Pass', COLD_TRAP: miss ? null : 'Pass', WIPER_NOISE: miss ? null : 'Pass', LEAKS: miss ? null : 'Pass', HOUSEKEEPING: miss ? null : 'Pass', REMARKS: miss ? null : 'Oil amber, level OK', INITIALS: e.operator };
      entries.push({ ...e, fields: fillSection(form, 'CHECKS', vals, undefined, e.assetId) });
    }
  }
  n = entries.reduce((m, e) => Math.max(m, Number(e.id.slice(3))), 0);

  // ---- batch records (last 10 days)
  for (const b of ds.batches.filter(x => x.start > now - 10 * 24 * H)) {
    const a = b.assetId; const sh = shiftOf(b.start); const closeT = b.end ?? now;
    const st: LogbookEntry['status'] = b.end === null ? 'Due' : b.end > now - 6 * H ? 'Submitted' : b.end > now - 30 * H ? 'Reviewed' : 'Approved';
    const ppl = people(st, sh, b.id); const op = ppl.operator; const fin = b.end !== null;
    const base = { assetId: a, batchId: b.id, shift: sh, dueAt: closeT, submittedAt: st === 'Due' ? null : closeT + 25 * MIN, status: st, ...ppl, corrections: [] as LogbookEntry['corrections'] };
    const ps = (p: string) => iso(phase(b, p)?.start); const pe = (p: string) => iso(phase(b, p)?.end ?? null);
    const mid = (p: string) => { const x = phase(b, p); return x ? (x.start + (x.end ?? now)) / 2 : b.start; };

    if (a.startsWith('L2-WFE') && fin && b.end! > since) {
      const form = formByNo(a.endsWith('2M') ? 'FOR-BIP-010' : 'FOR-BIP-009')!;
      const dist = r((b.outputKg ?? 0), 1), res = r(b.inputKg - (b.outputKg ?? 0) - b.inputKg * between(b.id + 'ml', 0.004, 0.018), 1);
      const run = b.phases.filter(p => p.name === 'STEADY FEED').reduce((s, p) => s + ((p.end ?? now) - p.start), 0) / H;
      let fields = [
        ...fillSection(form, 'HEADER', { BATCH_ID: b.id, INPUT_LOTS: inputLots(ds, b), ASSET: a, START_TIME: ps('STEADY FEED') }),
        ...fillSection(form, 'HANDOFF', { OUT_OPERATOR: op, IN_OPERATOR: pickS(b.id + 'in', PEOPLE[shiftOf(closeT)].ops), HANDOFF_TIME: iso(closeT - 20 * MIN), HANDOFF_NOTES: 'Run complete, residue drummed.' }),
        ...fillSection(form, 'CLOSE', { MASS_IN: r(b.inputKg, 1), MASS_DIST: dist, MASS_RES: res, MASS_BAL: r((dist + res) / b.inputKg * 100, 1), STOP_TIME: pe('STEADY FEED'), RUN_H: r(run, 2) }),
      ];
      if (form.formNo === 'FOR-BIP-010') {
        const pot = r(b.metrics.yieldPct ? 84 + (b.metrics.yieldPct - 70) * 0.25 + between(b.id + 'p', -1.5, 2.5) : 88, 1);
        fields = [...fields,
          ...fillSection(form, 'OIL', { OIL_TIME: iso(mid('STEADY FEED')), OIL_KG: r(between(b.id + 'o', 18, 40), 2), OIL_CONFIRM: true, INITIALS: op }, 1),
          ...fillSection(form, 'DISTILLATE', { POTENCY: pot, D9_THC: r(between(b.id + 'd9', 0.05, 0.29), 3), COLOUR: pot < 85 ? 'Amber' : pickS(b.id + 'c', ['Light gold', 'Gold']) })];
      }
      fields.push(...fillSection(form, 'EXCEPTIONS', { DEV_REF: devFor(ds, b.id), COMMENTS: null }));
      push({ formNo: form.formNo, ...base, fields });
    }

    if (a.startsWith('L2-ISO')) {
      const form = formByNo('FOR-BIP-004')!; const crash = (b as Batch & { crash?: number }).crash ?? 1;
      const cp = phase(b, 'CRASH'); let m18: number | null = null;
      if (cp) for (let t = cp.start, run = 0; t <= Math.min(cp.end ?? now, now - 1); t += MIN) { if (valueAt(ds, a, 'T_INT', t) <= -18) { if (++run >= 5) { m18 = t - 4 * MIN; break; } } else run = 0; }
      const iso_kg = fin ? r((b.outputKg ?? 0), 2) : null; const inp = r(b.inputKg, 1); const hepC = r(inp * 2.5, 1);
      const yel = b.metrics.crashEndT !== undefined && b.metrics.crashEndT > -18;
      push({ formNo: form.formNo, ...base, fields: [
        ...fillSection(form, 'HEADER', { REACTOR: 'ISO-' + a.slice(-1), BATCH_ID: b.id, INPUT_LOTS: b.parentIds.join(', '), INPUT_KG: inp }),
        ...fillSection(form, 'CHARGE', { HEP_CALC_L: hepC, HEP_ACT_L: r(hepC * between(b.id + 'h', 0.99, 1.012), 1) }),
        ...fillSection(form, 'CRASH', {
          CRASH_NO: crash, DISSOLVE_T: va(a, 'T_INT', mid('DISSOLVE')), DISSOLVE_TIME: pe('DISSOLVE'), COOL_START: ps('CONTROLLED COOL'),
          REACHED_M18: iso(m18), HOLD_START: ps('HOLD'), HOLD_END: pe('HOLD'), CRASH_END_T: b.metrics.crashEndT !== undefined ? r(b.metrics.crashEndT, 1) : null,
          TRANSFER_TIME: ps('TRANSFER/FILTER'), RINSE1_L: fin ? r(inp * 0.6, 1) : null, RINSE1_TIME: ps('RINSE'),
          RINSE2_L: fin ? r(inp * 0.6, 1) : null, RINSE2_TIME: iso(phase(b, 'RINSE') ? phase(b, 'RINSE')!.start + 40 * MIN : null),
          RINSE3_L: fin ? r(inp * 0.6, 1) : null, RINSE3_TIME: iso(phase(b, 'RINSE') ? phase(b, 'RINSE')!.start + 80 * MIN : null),
          FLUFF_MIX: fin ? true : null, TRAY_IN: fin ? pe('RINSE') : null, TRAY_OUT: fin ? iso(closeT + 14 * H) : null,
          OVEN_ID: fin ? pickS(b.id + 'ov', ['VO-01', 'VO-02']) : null, ISOLATE_KG: iso_kg, YIELD_PCT: fin ? r(b.metrics.yieldPct ?? 0, 1) : null,
          VIS_COLOUR: fin ? (yel ? 'Off-white' : 'White') : null, VIS_DRYNESS: fin ? 'Dry' : null, VIS_CONDITION: fin ? 'Free-flowing crystals' : null, INITIALS: fin ? op : null,
        }, crash),
        ...fillSection(form, 'NOTES', { DEV_REF: devFor(ds, b.id), NOTES: b.end === null && a === 'L2-ISO-C' ? 'Crash slower than usual - chiller return temp checked.' : null }),
      ] });
    }

    if (a.startsWith('L2-RXN')) {
      const form = formByNo('FOR-BIP-003')!; const inp = r(b.inputKg, 2); const m = b.metrics;
      const exo = phase(b, 'EXOTHERM'); let peakT: number | null = null;
      if (exo) { let best = -1e9; for (let t = exo.start; t <= Math.min(exo.end ?? now, now - 1); t += MIN) { const v = valueAt(ds, a, 'T_INT', t); if (v > best) { best = v; peakT = t; } } }
      const washVals = (i: number) => ({ WASH_NO: i, WASH_DONE: phase(b, `WASH ${i}`)?.end ? true : null, WASH_PH: phase(b, `WASH ${i}`)?.end ? (i === 3 ? r(m.wash3PH ?? 7.2, 1) : r(between(b.id + 'w' + i, 3.5, 6), 1)) : null, WASH_TIME: ps(`WASH ${i}`), INITIALS: phase(b, `WASH ${i}`)?.end ? op : null });
      push({ formNo: form.formNo, ...base, fields: [
        ...fillSection(form, 'HEADER', { REACTION_ID: b.id, REACTOR: 'RXN-' + a.slice(-1), INPUT_LOTS: b.parentIds.join(', '), INPUT_KG: inp }),
        ...fillSection(form, 'RECIPE', { HEP_CALC_L: r(inp * 4, 1), HEP_ACT_L: r(inp * 4 * between(b.id + 'h', 0.99, 1.01), 1), ACID_CALC_KG: r(inp * 0.05, 3), ACID_ACT_KG: r(inp * 0.05 * between(b.id + 'a', 0.985, 1.015), 3) }),
        ...fillSection(form, 'MILESTONES', {
          MATERIAL_IN: ps('CHARGE'), PRE_ACID_T: m.preAcidT !== undefined ? r(m.preAcidT, 1) : null, ACID_IN: ps('ACID IN'), ACID_ATTEST: phase(b, 'ACID IN') ? true : null,
          EXO_PEAK_T: m.exoPeakT !== undefined ? r(m.exoPeakT, 1) : null, EXO_PEAK_TIME: iso(peakT), EXO_RISE: m.exoRise !== undefined ? r(m.exoRise, 1) : null,
          EXO_TTP: m.exoTtpMin !== undefined ? Math.round(m.exoTtpMin) : null, SET_TEMP: phase(b, 'COOK') ? 90 : null, COOK_START: ps('COOK'), COOK_END: pe('COOK'),
          COOK_IN_BAND: m.cookInBandPct !== undefined ? r(m.cookInBandPct, 1) : null,
        }),
        ...[1, 2, 3].flatMap(i => fillSection(form, 'WASH', washVals(i), i)),
        ...fillSection(form, 'CLOSE', { OUTPUT_KG: fin ? r((b.outputKg ?? 0), 2) : null, YIELD_PCT: fin ? r(m.yieldPct ?? 0, 1) : null, NOTES: null, INITIALS: fin ? op : null }),
      ] });
    }

    if (a.startsWith('L1-EXT')) {
      const form = formByNo('FOR-KRT-101')!; const lot = biomassLot(b);
      const disc = ds.events.filter(e => e.assetId === a && e.state === 'DISC' && e.start >= b.start && e.start < closeT).reduce((s, e) => s + ((e.end ?? now) - e.start), 0) / MIN;
      const cyc = fin ? (b.end! - b.start) / H : null; const wx = h01(b.id + 'wx') < 0.06;
      push({ formNo: form.formNo, ...base, fields: [
        ...fillSection(form, 'HEADER', { CYCLE_ID: b.id, TANK: a.slice(-3), BIOMASS_LOT: lot, CHARGE_KG: r(b.inputKg, 1) }),
        ...fillSection(form, 'STEPS', { FILL_START: ps('FILL'), SOAK_START: ps('SOAK'), RECIRC_START: ps('RECIRC'), DRAIN_START: ps('DRAIN'), DRAIN_END: pe('DRAIN'), CYCLE_H: cyc === null ? null : r(cyc, 2) }),
        ...fillSection(form, 'PROCESS', { LIQ_TEMP: phase(b, 'RECIRC') ? va(a, 'TEMP', mid('RECIRC')) : null, LIQ_PH: phase(b, 'RECIRC')?.end ? va(a, 'PH', phase(b, 'RECIRC')!.end! - 5 * MIN, 2) : null,
          RECIRC_FLOW: phase(b, 'RECIRC') ? va(a, 'RECIRC_FLOW', mid('RECIRC'), 0) : null, DRAIN_L: fin ? Math.round((b.outputKg ?? 0) * 7.8) : null,
          TOTE_IDS: fin ? toteIds(b) : null, DISC_MIN: disc > 0 ? Math.round(disc) : null }),
        ...fillSection(form, 'CLOSE', { WEATHER_HOLD: fin ? wx : null, WEATHER_REASON: wx ? pickS(b.id + 'wr', ['Lightning', 'High wind', 'Heavy rain']) : null, NOTES: null, INITIALS: fin ? op : null }),
      ] });
    }

    if (a.startsWith('L1-CRY')) {
      const form = formByNo('FOR-KRT-103')!; const dp = phase(b, 'DOSE'); let phT: number | null = null;
      if (dp) for (let t = dp.start, run = 0; t <= Math.min(dp.end ?? now, now - 1); t += MIN) { if (valueAt(ds, a, 'PH', t) >= 9.3) { if (++run >= 5) { phT = t - 4 * MIN; break; } } else run = 0; }
      const recipe = r(b.inputKg * 0.42, 1);
      push({ formNo: form.formNo, ...base, fields: fillSection(form, 'CRYST', {
        BATCH_ID: b.id, CRYSTALLIZER: 'CRY-' + a.slice(-2), SOURCE: b.parentIds.join(', '), CHARGE_KG: r(b.inputKg, 1),
        DOSE_START: ps('DOSE'), PH_REACHED: iso(phT), BASE_RECIPE_L: recipe, BASE_DOSED_L: dp?.end ? r(recipe * between(b.id + 'bd', 0.97, 1.06), 1) : null,
        FINAL_PH: b.metrics.finalPH !== undefined ? r(b.metrics.finalPH, 2) : null, T_HOLD: phase(b, 'HOLD') ? va(a, 'T_INT', mid('HOLD')) : null,
        HOLD_START: ps('HOLD'), HOLD_END: pe('HOLD'), HOLD_H: b.metrics.holdH !== undefined ? r(b.metrics.holdH, 2) : null,
        CRYSTAL_APPEAR: fin ? (b.firstPass ? 'Pale, granular' : pickS(b.id + 'ap', ['Fine / slow settling', 'Dark / off-colour'])) : null,
        YIELD_PCT: fin ? r(b.metrics.yieldPct ?? 0, 1) : null, INITIALS: fin ? op : null,
      }, undefined, a) });
    }

    if (a === 'L1-FIL-01') {
      const form = formByNo('FOR-KRT-103')!; const fp = phase(b, 'FILTER'); const dry = phase(b, 'DRY');
      push({ formNo: form.formNo, ...base, fields: fillSection(form, 'FILTER', {
        FD_BATCH: b.id, SOURCE: b.parentIds.join(', '), FILT_START: ps('FILTER'), FILT_END: pe('FILTER'),
        FILT_MIN: fp?.end ? Math.round((fp.end - fp.start) / MIN) : null, DP_MAX: fp ? r(between(b.id + 'dp', 0.6, 1.45), 2) : null, WASH_L: phase(b, 'WASH') ? r(b.inputKg * 0.8, 1) : null,
        DRY_TEMP: dry ? r(between(b.id + 'dt', 43.5, 47.5), 1) : null, DRY_H: dry?.end ? r((dry.end - dry.start) / H, 1) : null,
        LOD: fin ? r(between(b.id + 'lod', 0.12, b.firstPass ? 0.45 : 0.7), 2) : null, DRY_KG: fin ? r((b.outputKg ?? 0), 2) : null, INITIALS: fin ? op : null,
      }, undefined, a) });
      // FOR-KRT-104: one or two drums per filter-dryer batch
      if (fin && b.end! > since) {
        const drums = (b.outputKg ?? 0) > 25 ? 2 : 1; const f104 = formByNo('FOR-KRT-104')!;
        for (let i = 0; i < drums; i++) {
          const net = r(drums === 2 ? (i === 0 ? 25 : (b.outputKg ?? 0) - 25) : (b.outputKg ?? 0), 2), tare = r(between(b.id + 't' + i, 8.2, 8.6), 2);
          const at = b.end! + (20 + i * 12) * MIN; const s2 = statusFor(at, b.id + 'd' + i);
          push({ formNo: f104.formNo, assetId: 'L1-FIL-01', batchId: b.id, shift: shiftOf(at), dueAt: at, submittedAt: done(s2) ? at + 3 * MIN : null, status: s2, ...people(s2, shiftOf(at), b.id + i, PEOPLE[shiftOf(at)].sup), corrections: [],
            fields: fillSection(f104, 'DRUM', { DRUM_ID: `FBD-26-${String(4000 + Number(b.id.slice(-4)) * 2 + i).padStart(4, '0')}`, SOURCE_BATCH: b.id, GROSS_KG: r(net + tare, 2), TARE_KG: tare, NET_KG: net, SEAL_NO: `S-${Math.floor(between(b.id + 's' + i, 100000, 999999))}`, LABEL_CHECK: done(s2) ? true : null, INITIALS: done(s2) ? pickS(b.id + i, PEOPLE[shiftOf(at)].ops) : null }) });
        }
      }
    }

    if (a === 'L1-SLT-01' || a === 'L1-SDR-01') {
      const form = formByNo('FOR-KRT-105')!;
      if (a === 'L1-SLT-01') {
        const fb = r(b.inputKg, 2); const calc = r(fb * 0.151, 2);
        push({ formNo: form.formNo, ...base, fields: fillSection(form, 'SALT', { RUN_ID: b.id, DRUMS: drumsFor(ds, b), FB_KG: fb, ACID_CALC_KG: calc, ACID_ACT_KG: r(calc * between(b.id + 'ac', 0.99, 1.012), 2),
          T_REACT: phase(b, 'REACT') ? va(a, 'T_INT', mid('REACT')) : null, PH_END: fin ? r(between(b.id + 'ph', 4.75, b.firstPass ? 5.3 : 5.55), 2) : null, WET_KG: fin ? r((b.outputKg ?? 0) * 1.06, 2) : null, INITIALS: fin ? op : null }, undefined, a) });
      } else {
        const dry = phase(b, 'DRY') ?? b.phases[1];
        push({ formNo: form.formNo, ...base, fields: fillSection(form, 'DRY', { DRY_ID: b.id, DRY_TEMP: r(between(b.id + 't', 48, 52), 1), DRY_VAC: Math.round(between(b.id + 'v', 22, 45)),
          DRY_H: dry?.end ? r((dry.end - dry.start) / H, 1) : null, LOD: fin ? r(between(b.id + 'l', 0.1, 0.42), 2) : null, ASSAY: fin ? r(between(b.id + 'as', b.firstPass ? 98.2 : 97.4, 99.4), 1) : null, DRY_KG: fin ? r((b.outputKg ?? 0), 2) : null, INITIALS: fin ? op : null }, undefined, a) });
      }
    }

    // LOG-CLEAN for every completed CLEAN phase in the last 7 days
    const cl = phase(b, 'CLEAN');
    if (cl?.end && cl.end > since && cl.end <= now) {
      const form = formByNo('LOG-CLEAN')!; const s2 = statusFor(cl.end, b.id + 'cl');
      push({ formNo: form.formNo, assetId: a, batchId: b.id, shift: shiftOf(cl.end), dueAt: cl.end, submittedAt: done(s2) ? cl.end + 5 * MIN : null, status: s2, ...people(s2, shiftOf(cl.end), b.id + 'cl', PEOPLE[shiftOf(cl.end)].sup), corrections: [],
        fields: fillSection(form, 'CLEAN', { ASSET: a, PREV_BATCH: b.id, PREV_PRODUCT: b.product, METHOD: a.startsWith('L1') ? pickS(b.id + 'm', ['Heptane flush', 'Hot water + detergent']) : pickS(b.id + 'm', ['Ethanol rinse', 'Heptane flush']),
          START: iso(cl.start), END: iso(cl.end), VISUAL_CLEAN: done(s2) ? true : null, INITIALS: done(s2) ? pickS(b.id + 'o', PEOPLE[shiftOf(cl.end)].ops) : null, RELEASED_BY: s2 === 'Reviewed' || s2 === 'Approved' ? PEOPLE[shiftOf(cl.end)].sup : null }) });
    }
  }

  // ---- LOG-EQ-DAILY for every other asset, both shifts, last 3 days (mostly Pass, a few Fails with photo + remark)
  {
    const form = formByNo('LOG-EQ-DAILY')!;
    for (const asset of ds.assets.filter(x => x.id !== 'L2-WFE-2M')) for (let d = 0; d < 3; d++) for (const sh of ['A', 'B'] as ShiftId[]) {
      const due = now - d * 24 * H - (sh === 'A' ? 4.3 : -1.7) * H; if (due > now + 2 * H) continue;
      const key = asset.id + d + sh; const s2: LogbookEntry['status'] = due > now ? 'Due' : h01(key) < 0.04 ? 'Overdue' : 'Approved';
      const fail = done(s2) && h01(key + 'f') < 0.07; const failKey = fail ? pickS(key + 'k', ['LEAKS', 'HOUSEKEEPING', 'AGIT', 'PH_BUFFER']) : '';
      const pf = (k: string) => (done(s2) ? (k === failKey ? 'Fail' : 'Pass') : null);
      push({ formNo: form.formNo, assetId: asset.id, batchId: null, shift: sh, dueAt: due, submittedAt: done(s2) ? due - 35 * MIN : null, status: s2, ...people(s2, sh, key, PEOPLE[sh].sup), corrections: [],
        fields: fillSection(form, 'CHECKS', { VP_OIL: pf('VP_OIL'), CHL_GLYCOL: pf('CHL_GLYCOL'), COLD_TRAP: pf('COLD_TRAP'), WIPER_NOISE: pf('WIPER_NOISE'), PH_BUFFER: pf('PH_BUFFER'), SCALE_VERIF: pf('SCALE_VERIF'), AGIT: pf('AGIT'), LEAKS: pf('LEAKS'), HOUSEKEEPING: pf('HOUSEKEEPING'),
          PHOTO: fail ? `photo://${key}.jpg` : null, REMARKS: fail ? `${failKey} failed - maintenance request raised` : null, INITIALS: done(s2) ? pickS(key, PEOPLE[sh].ops) : null }, undefined, asset.id) });
    }
  }

  // ---- FOR-KRT-102 every 4 h while LLE is in CONTACT (last 7 days)
  {
    const form = formByNo('FOR-KRT-102')!;
    for (let t = Math.ceil(since / (4 * H)) * 4 * H; t <= now + 4 * H; t += 4 * H) {
      const ev = ds.events.find(e => e.assetId === 'L1-LLE-01' && e.start <= Math.min(t, now - 1) && (e.end ?? now) > Math.min(t, now - 1));
      if (!ev || ev.phase !== 'CONTACT') continue;
      const s2 = statusFor(t, 'lle' + t); const sh = shiftOf(t); const past = t <= now;
      const org = past ? va('L1-LLE-01', 'ORG_FLOW', t) : null, aq = past ? va('L1-LLE-01', 'AQ_FLOW', t) : null;
      const emul = past && h01('em' + t) < 0.07;
      push({ formNo: form.formNo, assetId: 'L1-LLE-01', batchId: ev.batchId, shift: sh, dueAt: t, submittedAt: done(s2) ? t + 6 * MIN : null, status: s2, ...people(s2, sh, 'lle' + t, PEOPLE[sh].sup), corrections: [], fields: [
        ...fillSection(form, 'LLE', { CHECK_TIME: iso(t), LLE_BATCH: ev.batchId, ORG_FLOW: org, AQ_FLOW: aq, OA_RATIO: org && aq ? r(org / aq, 2) : null, AQ_PH: past ? va('L1-LLE-01', 'AQ_PH', t, 2) : null,
          INTERFACE: done(s2) ? (emul ? 'Rag layer > 1 cm' : pickS('if' + t, ['Sharp', 'Sharp', 'Rag layer < 1 cm'])) : null, EMULSION: done(s2) ? emul : null, HEP_IN_L: org ? Math.round(org * 240) : null }),
        ...fillSection(form, 'SRU', { REB_TEMP: past ? va('L1-SRU-01', 'REB_TEMP', t) : null, COND_OUT: past ? va('L1-SRU-01', 'COND_OUT', t) : null, HEP_REC_L: past ? Math.round(va('L1-SRU-01', 'REC_FLOW', t) * 4) : null,
          HEP_T01_PCT: done(s2) ? Math.round(between('t1' + t, 35, 80)) : null, HEP_T02_PCT: done(s2) ? Math.round(between('t2' + t, 20, 70)) : null, REC_PURITY: done(s2) ? r(between('pu' + t, 97.6, 99.6), 1) : null, INITIALS: done(s2) ? pickS('o' + t, PEOPLE[sh].ops) : null }),
      ] });
    }
  }

  // ---- LOG-SHIFT per line per shift (last 7 days, incl. current open shift)
  {
    const form = formByNo('LOG-SHIFT')!;
    const shiftStart = (t: number) => { const d = new Date(t); const etH = (d.getUTCHours() + 24 - 4) % 24; const back = (etH >= 6 && etH < 18 ? etH - 6 : (etH + 6) % 24) * H + d.getUTCMinutes() * MIN + d.getUTCSeconds() * 1000 + d.getUTCMilliseconds(); return t - back; };
    for (let s0 = shiftStart(now) - 13 * 12 * H; s0 <= shiftStart(now); s0 += 12 * H) for (const line of ['L1', 'L2'] as const) {
      const s1 = s0 + 12 * H; const end = Math.min(s1, now); const open = s1 > now; const sh = shiftOf(s0 + H);
      const evs = ds.events.filter(e => e.line === line && e.start < end && (e.end ?? now) > s0);
      const ov = (e: { start: number; end: number | null }) => Math.max(0, Math.min(e.end ?? now, end) - Math.max(e.start, s0)) / H;
      const con = line === 'L2' ? ['L2-WFE-2M'] : ['L1-CRY-01', 'L1-CRY-02'];
      const run = evs.filter(e => con.includes(e.assetId) && e.state === 'RUN').reduce((s, e) => s + ov(e), 0) / con.length;
      const dn = evs.filter(e => ['DOWN', 'MICRO', 'IDLE', 'HOLD'].includes(e.state));
      const byR: Record<string, number> = {}; dn.forEach(e => { const k = e.reasonCode ?? 'U000'; byR[k] = (byR[k] ?? 0) + ov(e); });
      const top = Object.entries(byR).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${ds.reasons.find(x => x.code === k)?.label ?? 'Untagged'} (${r(v, 1)} h)`).join('; ');
      const ql = ds.qualityLosses.filter(q => q.line === line && q.at >= s0 && q.at < end).reduce((s, q) => s + q.qtyKg, 0);
      const dev = ds.deviations.filter(d => d.line === line && d.start < end && (d.end === null || d.end > end)).length;
      const wip = ds.batches.filter(b => b.line === line && b.start < end && (b.end === null || b.end > end)).map(b => b.id).slice(0, 8).join(', ');
      const s2: LogbookEntry['status'] = open ? 'Due' : statusFor(s1, 'sh' + line + s0) === 'Overdue' ? 'Submitted' : statusFor(s1, 'sh' + line + s0);
      const nextSup = PEOPLE[sh === 'A' ? 'B' : 'A'].sup;
      const note = line === 'L2' && open ? '2M WFE down since 07:42 - vacuum 0.184 mbar, pump oil degraded (E102). Maintenance on pump; ISO-C crash running slow, watch -18 degC endpoint.' : done(s2) ? pickS('n' + line + s0, ['Normal running. No safety issues.', 'Changeover completed as planned.', 'Chiller return temp watched - within limits.', 'Two stops tagged late - reminded crew.']) : null;
      push({ formNo: form.formNo, assetId: line === 'L2' ? 'L2-WFE-2M' : 'L1-CRY-01', batchId: null, shift: sh, dueAt: s1, submittedAt: done(s2) ? s1 - 10 * MIN : null, status: s2,
        operator: done(s2) ? PEOPLE[sh].sup : null, reviewer: done(s2) ? nextSup : null, approver: null, corrections: [], fields: [
          ...fillSection(form, 'AUTO', { LINE: line, SHIFT: sh, RUN_H: r(run, 1), UNPLANNED_H: r(dn.reduce((s, e) => s + ov(e), 0), 1), TOP_DT: top || 'None', UNTAGGED: dn.filter(e => !e.reasonCode || e.reasonCode === 'U000').length, QL_KG: r(ql, 1), OPEN_DEV: dev, BATCHES_WIP: wip }),
          ...fillSection(form, 'NOTES', { SAFETY: done(s2) || open ? 'No incidents.' : null, NOTES: note, ACTIONS: open && line === 'L2' ? 'Confirm pump oil change; close E102 RCA; re-check vacuum < 0.05 mbar before restart.' : null, OUT_SIGN: done(s2) ? PEOPLE[sh].sup : null, IN_SIGN: done(s2) ? nextSup : null }),
        ] });
    }
  }

  // ---- LOG-SOLV daily (last 7 days)
  {
    const form = formByNo('LOG-SOLV')!; let inv = 21000;
    for (let d = 7; d >= 1; d--) {
      const t = now - d * 24 * H; const day0 = t - 24 * H; const s2 = statusFor(t, 'solv' + d);
      const mit = ds.batches.filter(b => b.assetId === 'L1-FIL-01' && b.end && b.end > day0 && b.end <= t).reduce((s, b) => s + (b.outputKg ?? 0), 0);
      const toLLE = Math.round(between('l' + d, 9000, 11500)), rec = Math.round(toLLE * between('rc' + d, 0.988, 0.9965)), wash = Math.round(mit * 0.8), rcpt = d % 3 === 0 ? 1000 : 0;
      const loss = toLLE + wash - rec; const gap = Math.round(between('gp' + d, -40, 60)); const close = inv + rcpt + rec - toLLE - wash - gap;
      push({ formNo: form.formNo, assetId: 'L1-SRU-01', batchId: null, shift: 'A', dueAt: t, submittedAt: done(s2) ? t + 30 * MIN : null, status: s2, operator: done(s2) ? pickS('so' + d, PEOPLE.A.ops) : null, reviewer: s2 === 'Approved' || s2 === 'Reviewed' ? PEOPLE.pm : null, approver: null, corrections: [],
        fields: fillSection(form, 'BAL', { DAY: iso(day0), OPEN_L: inv, RECEIPT_L: rcpt, RECOVERED_L: rec, TO_LLE_L: toLLE, TO_WASH_L: wash, CLOSE_L: Math.round(close), LOSS_L: loss, MIT_KG: r(mit, 1), LOSS_PER_KG: mit > 0 ? r(loss / mit, 2) : null, INITIALS: done(s2) ? pickS('so' + d, PEOPLE.A.ops) : null }) });
      inv = Math.round(close);
    }
  }

  // ---- LOG-CAL events (last 30 days) incl. the CRY-02 pH probe drift story
  {
    const form = formByNo('LOG-CAL')!;
    const cal: [string, string, string, number, number, number, number][] = [
      ['L1-CRY-02.PH', 'L1-CRY-02', 'pH buffer 10.01 lot B-2241', 10.01, 10.19, 10.02, 0.05],
      ['L1-CRY-01.PH', 'L1-CRY-01', 'pH buffer 10.01 lot B-2241', 10.01, 10.03, 10.01, 0.05],
      ['L1-LLE-01.AQ_PH', 'L1-LLE-01', 'pH buffer 10.01 lot B-2241', 10.01, 10.04, 10.01, 0.05],
      ['L2-WFE-2M.VAC_PV', 'L2-WFE-2M', 'Ref. gauge RG-07', 0.01, 0.012, 0.010, 0.003],
      ['L2-WFE-1M.EVAP_PV', 'L2-WFE-1M', 'Dry-block DB-02', 150, 150.4, 150.1, 0.5],
      ['L2-ISO-C.T_INT', 'L2-ISO-C', 'Ref. RTD RT-11', -20, -19.6, -20.0, 0.5],
      ['L2-RXN-1.T_INT', 'L2-RXN-1', 'Ref. RTD RT-11', 90, 90.3, 90.0, 0.5],
      ['L1-DRM-SC01', 'L1-FIL-01', 'Test weight 20 kg M1', 20, 20.01, 20.0, 0.02],
      ['L2-BUF-01 scale', 'L2-BUF-01', 'Test weight 10 kg F1', 10, 10.004, 10.0, 0.01],
      ['L1-EXT-T02.PH', 'L1-EXT-T02', 'pH buffer 4.01 lot A-1180', 4.01, 4.05, 4.01, 0.05],
    ];
    cal.forEach(([ins, asset, std, ref, found, left, tol], i) => {
      const t = now - (27 - i * 2.6) * 24 * H - between(ins, 0, 6) * H; const sh = shiftOf(t); const pass = Math.abs(found - ref) <= tol;
      push({ formNo: form.formNo, assetId: asset, batchId: null, shift: sh, dueAt: t, submittedAt: t + 10 * MIN, status: 'Approved', operator: pickS(ins, PEOPLE[sh].ops), reviewer: null, approver: PEOPLE.qa, corrections: [],
        fields: fillSection(form, 'CAL', { INSTRUMENT: ins, ASSET: asset, STANDARD: std, AS_FOUND: found, AS_LEFT: left, REFERENCE: ref, TOLERANCE: tol, RESULT: pass ? 'Pass' : 'Fail', NEXT_DUE: iso(t + (ins.includes('PH') ? 7 : 90) * 24 * H), TECH: pickS(ins, PEOPLE[sh].ops) }) });
    });
  }

  entries.sort((x, y) => y.dueAt - x.dueAt);
  return { ...ds, logbookTemplates: FORMS.map(({ formNo, title, revision, effective, assets, level, everyH, demo }) => ({ formNo, title, revision, effective, assets, level, everyH, demo })), logbookEntries: entries };
}

// ------------------------------------------------------------------ small genealogy helpers
function inputLots(_ds: DS, b: Batch | undefined): string | null {
  if (!b) return null;
  if (b.parentIds.length) return b.parentIds.join(', ');
  // 1M: crude / WDC lots are upstream of the demo model - derive stable IDs
  const k = Number(b.id.replace(/\D/g, '').slice(-4));
  return [`CR-26-${String(300 + (k % 97)).padStart(4, '0')}`, `WDC-26-${String(120 + (k % 41)).padStart(4, '0')}`].join(', ');
}
function biomassLot(b: Batch) { return `BM-26-${String(40 + Math.floor(Number(b.id.slice(-8, -2).replace(/\D/g, '')) / 7) % 30).padStart(4, '0')}`; }
function toteIds(b: Batch) { const k = Math.floor(h01(b.id) * 800); return [0, 1].map(i => `TOTE-${String(100 + ((k + i) % 800)).padStart(4, '0')}`).join(', '); }
function drumsFor(_ds: DS, b: Batch) { const k = Number(b.id.slice(-4)); return [`FBD-26-${String(4000 + k * 2).padStart(4, '0')}`, `FBD-26-${String(4001 + k * 2).padStart(4, '0')}`].join(', '); }
function devFor(ds: DS, batchId: string) { return ds.deviations.find(d => d.batchId === batchId)?.id ?? null; }
