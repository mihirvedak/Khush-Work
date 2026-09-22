/*
 * OBX x Faclon demo - deterministic synthetic data generator.
 * Same seed => same dataset. No external deps.
 *   const ds = buildDemoDataset({ seed: 2609, days: 30, now: '2026-09-22T16:20:00-04:00' });
 *   const s  = getSeries(ds, 'L2-WFE-2M', 'EVAP_PV', from, to, 60);
 *   const o  = computeOee(ds, { assetIds: ['L2-WFE-2M'], from, to, shift: 'B' });
 *   const c  = capability(values, lsl, usl, 5);
 * Demo simplification: plant clock uses a fixed UTC-4 (EDT) offset; the default window is fully inside EDT.
 */
import type {
  Asset, TagDef, Reason, Batch, StateEvent, QualityLoss, Deviation, LogbookTemplate, LogbookEntry,
  Escalation, DemoDataset, MachineState, ShiftId, LineId, Disposition, Source,
} from './types';

// ---------------------------------------------------------------- utils
const H = 3_600_000, MIN = 60_000;
const ET_OFFSET_H = -4;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rnd = mulberry32(1);
const uni = (a: number, b: number) => a + (b - a) * rnd();
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const lognormal = (median: number, sigma = 0.6) => median * Math.exp(sigma * gauss());
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
function weighted<T extends { weight: number }>(arr: T[]): T { const tot = arr.reduce((s, x) => s + x.weight, 0); let r = rnd() * tot; for (const x of arr) { r -= x.weight; if (r <= 0) return x; } return arr[arr.length - 1]; }
const etHour = (t: number) => (new Date(t + ET_OFFSET_H * H)).getUTCHours() + (new Date(t + ET_OFFSET_H * H)).getUTCMinutes() / 60;
export const shiftOf = (t: number): ShiftId => { const h = etHour(t); return h >= 6 && h < 18 ? 'A' : 'B'; };
const ymd = (t: number) => { const d = new Date(t + ET_OFFSET_H * H); return `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const pad = (n: number, w = 4) => String(n).padStart(w, '0');
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
// deterministic smooth noise in [-1,1] keyed by (t, key) - independent of sampling step
function hash(n: number) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function strHash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
const white = (t: number, key: string) => hash(Math.floor(t / 1000) ^ strHash(key)) * 2 - 1;
function smoothNoise(t: number, key: string, periodMs = 5 * MIN) { const k = strHash(key); const i = Math.floor(t / periodMs); const f = t / periodMs - i; const a = hash(i ^ k) * 2 - 1, b = hash((i + 1) ^ k) * 2 - 1; const s = f * f * (3 - 2 * f); return a + (b - a) * s + 0.35 * (hash(Math.floor(t / 20000) ^ k) * 2 - 1); }

// ---------------------------------------------------------------- people
export const PEOPLE = {
  A: { ops: ['J. Alvarez', 'K. Morgan', 'D. Pritchard'], sup: 'R. Ellis' },
  B: { ops: ['T. Nguyen', 'S. Brooks', 'M. Hale'], sup: 'L. Carter' },
  qa: 'Dr. P. Shah', pm: 'A. Whitfield', head: 'C. Donnelly',
};

// ---------------------------------------------------------------- assets (see references/01-line-knowledge.md)
const ph = (name: string, idealH: number, state?: MachineState) => ({ name, idealH, state });
export const ASSETS: Asset[] = [
  ...[1, 2, 3, 4].map((n): Asset => ({ id: `L1-EXT-T0${n}`, name: `Extraction Tank T0${n}`, line: 'L1', area: 'Outdoor Pad', stage: 'Pretreatment / extraction', kind: 'cyclic', isConstraint: false, product: 'Kratom Extract Liquor', phases: [ph('FILL', 0.75), ph('SOAK', 3), ph('RECIRC', 3.25), ph('DRAIN', 1)], batchSizeKg: [950, 1050], record: 'FOR-KRT-101', targets: { A: 0.8 - n * 0.01, P: 0.91, Q: 0.97 } })),
  { id: 'L1-LLE-01', name: 'LLE Skid', line: 'L1', area: 'Kratom Process Room', stage: 'Pretreatment / extraction', kind: 'continuous', isConstraint: false, product: 'MIT Organic Phase', ratedRate: 1320, rateUnit: 'L/h', phases: [ph('STARTUP', 0.5), ph('CONTACT', 22), ph('FLUSH', 1, 'PLAN')], batchSizeKg: [0, 0], record: 'FOR-KRT-102', targets: { A: 0.79, P: 0.74, Q: 0.93 } },
  { id: 'L1-SRU-01', name: 'Heptane Solvent Recovery', line: 'L1', area: 'Kratom Process Room', stage: 'Pretreatment / extraction', kind: 'continuous', isConstraint: false, product: 'Recovered Heptane', ratedRate: 180, rateUnit: 'L/h', phases: [ph('STARTUP', 1), ph('RECOVERY', 20), ph('SHUTDOWN', 0.5)], batchSizeKg: [0, 0], record: 'FOR-KRT-102', targets: { A: 0.83, P: 0.86, Q: 0.97 } },
  ...[1, 2].map((n): Asset => ({ id: `L1-CRY-0${n}`, name: `Crystallizer 0${n}`, line: 'L1', area: 'Kratom Process Room', stage: 'Crystallization batch', kind: 'batch', isConstraint: true, product: 'MIT Freebase', phases: [ph('CHARGE', 1), ph('DOSE', 3), ph('COOL', 4), ph('HOLD', 4), ph('DISCHARGE', 2), ph('CLEAN', 1.5, 'PLAN')], batchSizeKg: [28, 36], record: 'FOR-KRT-103', targets: n === 1 ? { A: 0.81, P: 0.8, Q: 0.92 } : { A: 0.77, P: 0.76, Q: 0.89 } })),
  { id: 'L1-FIL-01', name: 'Nutsche Filter-Dryer', line: 'L1', area: 'Kratom Process Room', stage: 'Crystallization batch', kind: 'drying', isConstraint: false, product: 'MIT Freebase (wet cake)', phases: [ph('LOAD', 0.5), ph('FILTER', 1.5), ph('WASH', 0.5), ph('DRY', 6), ph('UNLOAD', 0.5)], batchSizeKg: [28, 36], record: 'FOR-KRT-103', targets: { A: 0.86, P: 0.82, Q: 0.95 } },
  { id: 'L1-SLT-01', name: 'Acetate Salt Reactor', line: 'L1', area: 'Kratom Process Room', stage: 'Acetate salt run', kind: 'batch', isConstraint: false, product: 'MIT Acetate', phases: [ph('CHARGE', 0.5), ph('DISSOLVE', 1), ph('ACID ADD', 1), ph('REACT', 3), ph('CRYSTALLIZE', 3.5), ph('DISCHARGE', 1), ph('CLEAN', 1, 'PLAN')], batchSizeKg: [30, 45], record: 'FOR-KRT-105', targets: { A: 0.86, P: 0.83, Q: 0.96 } },
  { id: 'L1-SDR-01', name: 'Salt Vacuum Dryer', line: 'L1', area: 'Kratom Process Room', stage: 'Acetate salt run', kind: 'drying', isConstraint: false, product: 'MIT Acetate', phases: [ph('LOAD', 0.5), ph('DRY', 18), ph('UNLOAD', 0.5)], batchSizeKg: [30, 45], record: 'FOR-KRT-105', targets: { A: 0.9, P: 0.88, Q: 0.97 } },
  { id: 'L2-WFE-1M', name: '1M WFE Deterp', line: 'L2', area: 'Bulk Suite', stage: '1M WFE deterp', kind: 'continuous', isConstraint: false, product: 'Deterped Crude', ratedRate: 6, rateUnit: 'kg/h', phases: [ph('WARM-UP', 1.5), ph('VAC PULL-DOWN', 0.5), ph('STEADY FEED', 36), ph('SHUTDOWN', 0.5), ph('CLEAN', 2, 'PLAN')], batchSizeKg: [0, 0], record: 'FOR-BIP-009', targets: { A: 0.84, P: 0.86, Q: 0.96 } },
  { id: 'L2-WFE-2M', name: '2M WFE Distillation / FSD', line: 'L2', area: 'Bulk Suite', stage: '2M WFE distillation / FSD', kind: 'continuous', isConstraint: true, product: 'CBD Distillate', ratedRate: 4, rateUnit: 'kg/h', phases: [ph('WARM-UP', 2), ph('VAC PULL-DOWN', 1), ph('STEADY FEED', 44), ph('SHUTDOWN', 0.5), ph('CLEAN', 3, 'PLAN')], batchSizeKg: [0, 0], record: 'FOR-BIP-010', targets: { A: 0.72, P: 0.81, Q: 0.91 } },
  ...['A', 'B', 'C', 'D', 'E'].map((r, i): Asset => ({ id: `L2-ISO-${r}`, name: `Isolation Reactor ISO-${r}`, line: 'L2', area: 'Bulk Suite', stage: 'CBD isolation', kind: 'batch', isConstraint: false, product: 'CBD Isolate', phases: [ph('CHARGE', 1), ph('DISSOLVE', 2), ph('CONTROLLED COOL', 6), ph('CRASH', 7), ph('HOLD', 10), ph('TRANSFER/FILTER', 2), ph('RINSE', 2), ph('CLEAN', 1, 'PLAN')], batchSizeKg: [30, 40], record: 'FOR-BIP-004', targets: { A: [0.86, 0.84, 0.78, 0.88, 0.82][i], P: [0.8, 0.78, 0.7, 0.82, 0.76][i], Q: [0.95, 0.94, 0.9, 0.97, 0.93][i] } })),
  ...[1, 3].map((n): Asset => ({ id: `L2-RXN-${n}`, name: `Reactor RXN-${n}`, line: 'L2', area: 'Bulk Suite', stage: 'Derivative reaction', kind: 'batch', isConstraint: false, product: 'Delta-8 Crude', phases: [ph('CHARGE', 1), ph('HEAT', 1), ph('ACID IN', 0.25), ph('EXOTHERM', 0.25), ph('COOK', 3), ph('WASH 1', 1), ph('WASH 2', 1), ph('WASH 3', 1), ph('DRAIN', 0.5), ph('CLEAN', 1, 'PLAN')], batchSizeKg: [18, 26], record: 'FOR-BIP-003', targets: n === 1 ? { A: 0.8, P: 0.85, Q: 0.94 } : { A: 0.74, P: 0.79, Q: 0.9 } })),
  { id: 'L2-BUF-01', name: 'Buchner Filtration Station', line: 'L2', area: 'Bulk Suite', stage: 'Wash / final purification / drying', kind: 'drying', isConstraint: false, product: 'CBD Isolate (wet)', phases: [ph('LOAD', 0.25), ph('FILTER', 0.75), ph('RINSE', 0.5), ph('UNLOAD', 0.25)], batchSizeKg: [18, 30], record: 'FOR-BIP-004', targets: { A: 0.9, P: 0.8, Q: 0.97 } },
  ...[1, 2].map((n): Asset => ({ id: `L2-VO-0${n}`, name: `Vacuum Oven VO-0${n}`, line: 'L2', area: 'Bulk Suite', stage: 'Wash / final purification / drying', kind: 'drying', isConstraint: false, product: 'CBD Isolate', phases: [ph('LOAD', 0.5), ph('DRY', 24), ph('UNLOAD', 0.5)], batchSizeKg: [18, 30], record: 'FOR-BIP-004', targets: { A: 0.9, P: 0.9, Q: 0.96 } })),
];
const A = (id: string) => ASSETS.find(a => a.id === id)!;

// ---------------------------------------------------------------- tags (subset driving charts; full list in 01)
const t = (assetId: string, key: string, label: string, unit: string, source: Source, ds: TagDef['dataStateToday'], sampleSec: number, target?: number, lsl?: number, usl?: number, spc: TagDef['spc'] = 'xbar-r', golden = false, critical = false, demoLimit = true): TagDef => ({ assetId, key, label, unit, source, dataStateToday: ds, sampleSec, target, lsl, usl, spc, golden, critical, demoLimit });
export const TAGS: TagDef[] = [
  ...['L2-WFE-1M', 'L2-WFE-2M'].flatMap(id => { const m = id.endsWith('1M'); return [
    t(id, 'EVAP_PV', 'Evaporator temp (actual)', 'degC', 'Controller', 'DSP', 10, m ? 150 : 175, m ? 145 : 170, m ? 155 : 180, 'xbar-r', true),
    t(id, 'VAC_PV', 'Vacuum', 'mbar', 'Controller', 'DSP', 5, m ? 0.8 : 0.02, undefined, m ? 1.5 : 0.05, 'xbar-r', true),
    t(id, 'FEED_PV', 'Feed rate (actual)', 'kg/h', 'Controller', 'DSP', 5, m ? 5 : 3.5, m ? 4 : 3, m ? 6 : 4, 'xbar-r', true),
    t(id, 'FEED_T', 'Feed temperature', 'degC', 'Controller', 'DSP', 10, m ? 90 : 100, m ? 85 : 95, m ? 95 : 105),
    t(id, 'COND_PV', 'Condenser temp (actual)', 'degC', 'Controller', 'DSP', 10, m ? 50 : 70, m ? 45 : 65, m ? 55 : 75),
    t(id, 'WIPER_PV', 'Wiper speed (actual)', 'rpm', 'Controller', 'DSP', 5, 300, 280, 320),
    t(id, 'CHL_PV', 'Chiller / cold trap (actual)', 'degC', 'Controller', 'DSP', 30, m ? -10 : -15, m ? -15 : -20, m ? -5 : -10),
  ]; }),
  ...['A', 'B', 'C', 'D', 'E'].flatMap(r => [
    t(`L2-ISO-${r}`, 'T_INT', 'Internal product temp', 'degC', 'Controller', 'DS3', 10, undefined, undefined, undefined, 'none', true, true),
    t(`L2-ISO-${r}`, 'T_JKT', 'Jacket temp', 'degC', 'Controller', 'DS3', 10, undefined, undefined, undefined, 'none', true),
    t(`L2-ISO-${r}`, 'AGIT', 'Agitator', 'rpm', 'Controller', 'DS3', 10, 80, 60, 120),
    t(`L2-ISO-${r}`, 'CRASH_END_T', 'Crash endpoint internal temp', 'degC', 'Calculated', 'DSP', 0, -20, undefined, -18, 'i-mr', false, true, false),
  ]),
  ...[1, 3].flatMap(n => [
    t(`L2-RXN-${n}`, 'T_INT', 'Reaction temperature', 'degC', 'Controller', 'DS3', 1, undefined, undefined, undefined, 'none', true, true),
    t(`L2-RXN-${n}`, 'PRE_ACID_T', 'Temp at acid-in', 'degC', 'Calculated', 'DSP', 0, 52.5, 50, 55, 'i-mr', false, true, false),
    t(`L2-RXN-${n}`, 'EXO_PEAK_T', 'Exotherm peak temp', 'degC', 'Calculated', 'DSP', 0, 70, undefined, 78, 'i-mr'),
    t(`L2-RXN-${n}`, 'COOK_T', 'Cook temperature', 'degC', 'Controller', 'DSP', 10, 90, 85, 95, 'i-mr', false, true, false),
    t(`L2-RXN-${n}`, 'WASH3_PH', 'Final wash aqueous pH', 'pH', 'Manual', 'DSP', 0, 7, 6.5, 8, 'i-mr'),
  ]),
  ...[1, 2].flatMap(n => [
    t(`L1-CRY-0${n}`, 'PH', 'Batch pH', 'pH', 'Controller', 'DS3', 10, 9.6, 9.3, 9.9, 'none', true),
    t(`L1-CRY-0${n}`, 'T_INT', 'Internal product temp', 'degC', 'Controller', 'DS3', 10, 5, 2, 8, 'none', true),
    t(`L1-CRY-0${n}`, 'DOSE_RATE', 'Base dosing rate', 'L/h', 'Controller', 'DS3', 10, 12, 8, 15, 'none', true),
    t(`L1-CRY-0${n}`, 'FINAL_PH', 'Final pH (endpoint)', 'pH', 'Calculated', 'DS2', 0, 9.6, 9.3, 9.9, 'i-mr'),
    t(`L1-CRY-0${n}`, 'HOLD_H', 'Hold time', 'h', 'Calculated', 'DS2', 0, 4, 3.5, 6, 'i-mr'),
  ]),
  ...[1, 2, 3, 4].flatMap(n => [
    t(`L1-EXT-T0${n}`, 'LVL', 'Tank level', '%', 'PLC', 'DS3', 10, undefined, 5, 95, 'none'),
    t(`L1-EXT-T0${n}`, 'TEMP', 'Liquor temperature', 'degC', 'PLC', 'DS3', 10, 60, 55, 65),
    t(`L1-EXT-T0${n}`, 'PH', 'Liquor pH', 'pH', 'PLC', 'DS3', 30, 3.5, 3, 4),
    t(`L1-EXT-T0${n}`, 'RECIRC_FLOW', 'Recirculation flow', 'L/min', 'PLC', 'DS3', 10, 180, 150, 210),
  ]),
  t('L1-LLE-01', 'ORG_FLOW', 'Organic (heptane) flow', 'L/min', 'Controller', 'DS4', 5, 22, 18, 26),
  t('L1-LLE-01', 'AQ_FLOW', 'Aqueous flow', 'L/min', 'Controller', 'DS4', 5, 40, 34, 46),
  t('L1-LLE-01', 'AQ_PH', 'Aqueous pH', 'pH', 'Controller', 'DS3', 30, 9.8, 9.4, 10.2),
  t('L1-SRU-01', 'REB_TEMP', 'Reboiler temperature', 'degC', 'Controller', 'DS3', 10, 100, 97, 104),
  t('L1-SRU-01', 'COND_OUT', 'Condenser outlet temp', 'degC', 'Controller', 'DS3', 10, 22, undefined, 30),
  t('L1-SRU-01', 'REC_FLOW', 'Recovered heptane flow', 'L/h', 'Controller', 'DS4', 10, 180, 150, undefined),
  t('L1-SLT-01', 'T_INT', 'Reaction temperature', 'degC', 'Controller', 'DS3', 10, 45, 40, 50),
  t('L2-VO-01', 'TEMP', 'Oven temperature', 'degC', 'Controller', 'DS3', 30, 45, 40, 50),
  t('L2-VO-02', 'TEMP', 'Oven temperature', 'degC', 'Controller', 'DS3', 30, 45, 40, 50),
];

// ---------------------------------------------------------------- reasons (codes from 01 section 6)
const r = (code: string, category: Reason['category'], group: string, label: string, lines: LineId[], weight: number, medianMin: number, assetMatch?: RegExp): Reason => ({ code, category, group, label, lines, weight, medianMin, assetMatch });
export const REASONS: Reason[] = [
  r('P101', 'P', 'Changeover', 'Product / recipe change', ['L2'], 0, 60), r('P102', 'P', 'Changeover', 'Solvent swap', ['L1', 'L2'], 0, 45),
  r('P201', 'P', 'Cleaning', 'Reactor clean-out between batches', ['L1', 'L2'], 0, 60), r('P202', 'P', 'Cleaning', 'WFE clean / hot flush', ['L2'], 0, 150), r('P203', 'P', 'Cleaning', 'Filter cloth change', ['L1', 'L2'], 0, 40),
  r('P301', 'P', 'Planned maintenance', 'Scheduled PM', ['L1', 'L2'], 0, 180), r('P302', 'P', 'Planned maintenance', 'Vacuum pump oil change', ['L2'], 0, 60), r('P303', 'P', 'Planned maintenance', 'Wiper blade replacement', ['L2'], 0, 120), r('P304', 'P', 'Planned maintenance', 'Calibration (pH / TT / scale)', ['L1', 'L2'], 0, 30),
  r('P401', 'P', 'Shift', 'Shift handover', ['L1', 'L2'], 0, 15),
  r('E101', 'E', 'Vacuum system', 'Vacuum pump trip', ['L2', 'L1'], 5, 45, /WFE|FIL|VO|SDR/), r('E102', 'E', 'Vacuum system', 'Vacuum pump oil degraded', ['L2'], 6, 70, /WFE/), r('E103', 'E', 'Vacuum system', 'Vacuum leak (seal / O-ring)', ['L2'], 5, 90, /WFE|VO/), r('E104', 'E', 'Vacuum system', 'Cold trap iced / blocked', ['L2'], 3, 50, /WFE/),
  r('E201', 'E', 'Rotating', 'Wiper motor / VFD fault', ['L2'], 3, 60, /WFE/), r('E202', 'E', 'Rotating', 'Feed pump failure', ['L2'], 3, 40, /WFE/), r('E203', 'E', 'Rotating', 'Agitator fault', ['L1', 'L2'], 2, 45, /ISO|RXN|CRY|SLT/), r('E204', 'E', 'Rotating', 'Recirculation pump failure', ['L1'], 4, 55, /EXT/),
  r('E301', 'E', 'Thermal', 'Heater / TCU fault', ['L1', 'L2'], 3, 50, /RXN|SLT|VO|SRU|WFE/), r('E302', 'E', 'Thermal', 'Chiller fault / high return temp', ['L1', 'L2'], 3, 60, /ISO|CRY|WFE/), r('E303', 'E', 'Thermal', 'Jacket fluid leak', ['L1', 'L2'], 1, 120, /ISO|RXN|CRY/),
  r('E401', 'E', 'Instrumentation', 'pH probe drift / failure', ['L1'], 6, 35, /CRY|LLE/), r('E402', 'E', 'Instrumentation', 'Temperature sensor fault', ['L1', 'L2'], 2, 30), r('E403', 'E', 'Instrumentation', 'Scale fault', ['L1', 'L2'], 1, 25, /FIL|BUF/), r('E404', 'E', 'Instrumentation', 'Level transmitter fault', ['L1'], 2, 30, /EXT|LLE|SRU/),
  r('E501', 'E', 'Controls', 'PLC / HMI fault', ['L1'], 3, 40, /EXT/), r('E502', 'E', 'Controls', 'Valve failure (stuck / leaking)', ['L1', 'L2'], 3, 45, /EXT|LLE|SRU|RXN/), r('E503', 'E', 'Controls', 'Dosing pump fault', ['L1'], 3, 35, /CRY/),
  r('R101', 'R', 'Process', 'Vacuum loss - process (outgassing)', ['L2'], 8, 55, /WFE/), r('R201', 'R', 'Temperature excursion', 'Product temp out of band', ['L1', 'L2'], 3, 40, /ISO|RXN|CRY|SLT/), r('R202', 'R', 'Temperature excursion', 'Cooling too slow', ['L1', 'L2'], 3, 60, /ISO|CRY/), r('R203', 'R', 'Temperature excursion', 'Exotherm over-run', ['L2'], 2, 30, /RXN/),
  r('R301', 'R', 'Feed / flow', 'Feed line solidified / blocked', ['L2'], 6, 50, /WFE/), r('R302', 'R', 'Feed / flow', 'Low recirculation flow', ['L1'], 3, 40, /EXT/),
  r('R401', 'R', 'Separation', 'Emulsion / rag layer', ['L1'], 9, 80, /LLE/), r('R402', 'R', 'Separation', 'Slow phase separation', ['L1', 'L2'], 4, 50, /LLE|RXN/),
  r('R501', 'R', 'Filtration', 'Slow filtration / blinded cloth', ['L1', 'L2'], 6, 60, /FIL|BUF/), r('R502', 'R', 'Filtration', 'Wet cake / re-filter', ['L1', 'L2'], 3, 45, /FIL|BUF/),
  r('R601', 'R', 'pH control', 'pH overshoot', ['L1'], 4, 40, /CRY/), r('R602', 'R', 'pH control', 'pH not reaching endpoint', ['L1'], 3, 50, /CRY/), r('R701', 'R', 'Process', 'Foaming / carry-over', ['L1', 'L2'], 2, 35, /WFE|SRU/),
  r('M101', 'M', 'Waiting for feed', 'Biomass lot not released', ['L1'], 0.8, 90, /EXT/), r('M102', 'M', 'Waiting for feed', 'Crude / distillate not available', ['L2'], 1.2, 90, /WFE|ISO|RXN/), r('M103', 'M', 'Waiting for feed', 'Tote not available', ['L1'], 3, 50, /EXT|LLE|CRY/),
  r('M201', 'M', 'Waiting for solvent', 'Heptane low - fresh', ['L1', 'L2'], 1, 70, /LLE|ISO|RXN|CRY/), r('M202', 'M', 'Waiting for solvent', 'Recovered heptane off-spec', ['L1'], 2, 80, /LLE|SRU/),
  r('M301', 'M', 'Consumables', 'Waiting for base / acid / filter media / drums', ['L1', 'L2'], 1, 45), r('M401', 'M', 'Material', 'Input material out of spec', ['L1', 'L2'], 0.3, 120),
  r('U101', 'U', 'Utilities', 'Power outage / dip', ['L1', 'L2'], 1, 25), r('U201', 'U', 'Utilities', 'Nitrogen / compressed air low', ['L1', 'L2'], 1, 30), r('U301', 'U', 'Utilities', 'Cooling water / glycol loss', ['L1', 'L2'], 2, 45), r('U401', 'U', 'Utilities', 'Thermal fluid / steam loss', ['L1', 'L2'], 1, 40, /WFE|RXN|SRU|VO/),
  r('Q101', 'Q', 'Quality', 'Awaiting in-process lab result', ['L1', 'L2'], 2, 90, /WFE|ISO|RXN|CRY|SLT/), r('Q201', 'Q', 'Quality', 'Deviation investigation hold', ['L1', 'L2'], 0.3, 150), r('Q301', 'Q', 'Quality', 'Awaiting QA release to proceed', ['L1', 'L2'], 0.8, 70),
  r('H101', 'H', 'People', 'Operator not available', ['L1', 'L2'], 1.2, 35), r('H201', 'H', 'People', 'Awaiting supervisor sign-off', ['L1', 'L2'], 1, 20), r('H301', 'H', 'People', 'Training on job', ['L1', 'L2'], 1, 45),
  r('X101', 'X', 'External', 'Weather hold - lightning / storm', ['L1'], 12, 70, /EXT/), r('X102', 'X', 'External', 'Freeze protection', ['L1'], 0, 120, /EXT/), r('X201', 'X', 'External', 'Network / edge loss', ['L1', 'L2'], 0, 20), r('X301', 'X', 'External', 'Regulatory / inspection', ['L1', 'L2'], 0, 120),
  r('U000', 'UNK', 'Unassigned', 'Untagged', ['L1', 'L2'], 0, 20),
];
const reasonsFor = (a: Asset) => REASONS.filter(x => x.weight > 0 && x.lines.includes(a.line) && (!x.assetMatch || x.assetMatch.test(a.id)));
export const reasonLabel = (code: string) => REASONS.find(x => x.code === code)?.label ?? code;

const QL_REASONS: Record<string, [string, string, Disposition][]> = {
  'L1-EXT': [['QL1-03', 'Extract liquor pH out of range', 'REWORK']],
  'L1-LLE': [['QL1-04', 'Emulsion carry-over / aqueous in organic', 'REWORK']],
  'L1-SRU': [['QL1-04', 'Emulsion carry-over / aqueous in organic', 'REWORK']],
  'L1-CRY': [['QL1-05', 'Freebase assay < 97.0 %', 'REWORK'], ['QL1-07', 'Off-colour / dark crystals', 'REWORK'], ['QL1-06', '7-OH-mitragynine above demo limit', 'HOLD']],
  'L1-FIL': [['QL1-08', 'LOD > 0.5 %', 'REWORK'], ['QL1-09', 'Residual heptane > 5,000 ppm', 'REWORK']],
  'L1-SLT': [['QL1-12', 'Salt assay < 98.0 %', 'REWORK'], ['QL1-13', 'Final pH out of range', 'REWORK']],
  'L1-SDR': [['QL1-08', 'LOD > 0.5 %', 'REWORK']],
  'L2-WFE-1M': [['QL2-02', 'Residual terpenes / volatiles high in residue', 'REWORK']],
  'L2-WFE-2M': [['QL2-03', 'Distillate potency < 85 %', 'REWORK'], ['QL2-04', 'Distillate dark / colour off-spec', 'DOWNGRADE'], ['QL2-05', 'Delta-9 THC above limit', 'HOLD']],
  'L2-ISO': [['QL2-06', 'Isolate purity < 99.0 %', 'REWORK'], ['QL2-07', 'Yellow / off-white isolate (visual)', 'REWORK'], ['QL2-08', 'Crash endpoint not reached (> -18 degC)', 'REWORK']],
  'L2-RXN': [['QL2-09', 'Incomplete conversion (residual CBD high)', 'REWORK'], ['QL2-11', 'Wash pH out of range', 'REWORK'], ['QL2-10', 'Delta-9 THC / side-product above limit', 'HOLD']],
  'L2-BUF': [['QL2-15', 'Spill / handling loss', 'SCRAP']],
  'L2-VO': [['QL2-12', 'Residual heptane > 5,000 ppm', 'REWORK'], ['QL2-13', 'LOD / moisture high', 'REWORK']],
};
const qlFor = (id: string) => QL_REASONS[id] ?? QL_REASONS[id.split('-').slice(0, 2).join('-')] ?? [['QL2-14', 'Contamination / foreign matter', 'SCRAP']];

// ---------------------------------------------------------------- batch id formats (07)
const counters: Record<string, number> = {};
const next = (k: string, start = 1) => (counters[k] = (counters[k] ?? start - 1) + 1);
function batchId(a: Asset, t0: number, crash?: number): string {
  const d = ymd(t0);
  if (a.id.startsWith('L1-EXT')) return `KX-${a.id.slice(-3)}-${d}-${next('KX' + a.id + d, 1)}`;   // extraction cycle
  if (a.id === 'L1-LLE-01') return `LLE-${d}-${next('LLE' + d)}`;
  if (a.id === 'L1-SRU-01') return `SRU-${d}-${next('SRU' + d)}`;
  if (a.id.startsWith('L1-CRY')) return `MCB-26-${pad(next('MCB', 160))}`;
  if (a.id === 'L1-FIL-01') return `MFD-26-${pad(next('MFD', 150))}`;
  if (a.id === 'L1-SLT-01') return `MAS-26-${pad(next('MAS', 52))}`;
  if (a.id === 'L1-SDR-01') return `MSD-26-${pad(next('MSD', 50))}`;
  if (a.id === 'L2-WFE-1M') return `1M-${d}-${pad(next('1M' + d), 2)}`;
  if (a.id === 'L2-WFE-2M') return `2M-${d}-${pad(next('2M' + d), 2)}`;
  if (a.id.startsWith('L2-ISO')) return `ISO-${a.id.slice(-1)}-${d}-${pad(next('ISO' + a.id + d), 2)}-C${crash ?? 1}`;
  if (a.id.startsWith('L2-RXN')) return `D8-${d}-${pad(next('D8' + d), 2)}`;
  if (a.id === 'L2-BUF-01') return `BUF-${d}-${pad(next('BUF' + d), 2)}`;
  return `VO${a.id.slice(-1)}-${d}-${pad(next('VO' + a.id + d), 2)}`;
}

// ---------------------------------------------------------------- core simulation
interface Ctx { from: number; to: number; now: number; events: StateEvent[]; batches: Batch[]; ql: QualityLoss[]; }
let evSeq = 0;
function pushEvent(ctx: Ctx, a: Asset, state: MachineState, start: number, end: number, b: Batch | null, phase: string | null, reasonCode: string | null, detectedBy: string, extra: Partial<StateEvent> = {}) {
  if (end - start < 10_000) return;
  const s = Math.max(start, ctx.from), e = Math.min(end, ctx.now);
  if (e <= s) return;
  const sh = shiftOf(s), people = PEOPLE[sh];
  const untagged = reasonCode === 'U000';
  const isLoss = state !== 'RUN' && state !== 'NOSCH' && state !== 'DISC';
  let expected: number | null = null, actual: number | null = null;
  const hrs = (e - s) / H;
  if (state === 'RUN') {
    if (a.kind === 'continuous' && a.ratedRate) { expected = round(a.ratedRate * hrs); actual = round(expected * a.targets.P * (1 + 0.05 * gauss())); }
    else if (b) { const ideal = b.idealCycleH; expected = round(b.inputKg * hrs / ideal, 2); actual = round(expected * a.targets.P * (1 + 0.04 * gauss()), 2); }
  } else if (isLoss) { expected = 0; actual = 0; }
  ctx.events.push({
    id: `EV-${a.line}-${pad(++evSeq, 6)}`, assetId: a.id, line: a.line, state, start: s, end: e >= ctx.now && end >= ctx.now ? null : e,
    batchId: b?.id ?? null, phase, product: b?.product ?? (state === 'RUN' ? a.product : null), reasonCode,
    taggedBy: isLoss && !untagged && reasonCode ? pick(people.ops) : null,
    taggedAt: isLoss && !untagged && reasonCode ? s + Math.min(e - s, uni(4, 25) * MIN) : null,
    detectedBy, expectedQty: expected, actualQty: actual, ...extra,
  });
}

function pickReason(a: Asset, t0: number): Reason {
  let list = reasonsFor(a);
  // stories: WFE-2M shift B vacuum family heavier; CRY-02 pH probe; EXT afternoon storms
  if (a.id === 'L2-WFE-2M' && shiftOf(t0) === 'B') list = list.map(x => /E10[1-3]|R101/.test(x.code) ? { ...x, weight: x.weight * 2.6 } : x);
  if (a.id === 'L1-CRY-02') list = list.map(x => x.code === 'E401' || x.code === 'R601' ? { ...x, weight: x.weight * 3 } : x);
  if (a.id.startsWith('L1-EXT')) { const h = etHour(t0); list = list.map(x => x.code === 'X101' ? { ...x, weight: h >= 13 && h <= 20 ? x.weight * 2.5 : x.weight * 0.2 } : x); }
  return weighted(list);
}

const poisson = (lam: number) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 200); return k - 1; };
/** splits a RUN window into RUN + injected stops (Poisson placement); returns actual end time */
function runWithStops(ctx: Ctx, a: Asset, b: Batch | null, phase: string, start: number, runMs: number): number {
  const list = reasonsFor(a);
  const meanStopH = list.reduce((s, x) => s + x.weight * x.medianMin * 1.16, 0) / list.reduce((s, x) => s + x.weight, 0) / 60;
  const lossPerRunH = (1 / a.targets.A - 1) * 0.85;           // 85 % of availability loss from in-run stops, rest from idle gaps
  const rate = lossPerRunH / meanStopH;                        // stops per run-hour
  const thin = a.id === 'L2-WFE-2M' ? 1.5 : 1;                 // story: shift B has ~1.7x the stop rate of shift A on WFE-2M
  const k = poisson(rate * thin * runMs / H);
  const at = Array.from({ length: k }, () => rnd() * runMs).sort((x, y) => x - y);
  let t0 = start, consumed = 0;
  const runSeg = (len: number) => {
    const segEnd = t0 + len;
    if (a.id.includes('WFE')) { let mt = t0 + uni(0.3, 1.5) * H; while (mt < segEnd - 10 * MIN) { const md = uni(40, 260) * 1000; pushEvent(ctx, a, 'RUN', t0, mt, b, phase, null, 'Auto: state'); pushEvent(ctx, a, 'MICRO', mt, mt + md, b, phase, 'R301', 'Auto: feed = 0'); t0 = mt + md; mt = t0 + uni(0.5, 3) * H; } }
    pushEvent(ctx, a, 'RUN', t0, Math.max(t0, segEnd), b, phase, null, a.kind === 'cyclic' ? 'PLC step' : 'Auto: state');
    t0 = Math.max(t0, segEnd);
  };
  for (const off of at) {
    if (a.id === 'L2-WFE-2M' && shiftOf(t0 + (off - consumed)) === 'A' && rnd() > 0.6) continue;
    runSeg(off - consumed); consumed = off;
    const reason = pickReason(a, t0);
    const dur = lognormal(reason.medianMin * MIN, 0.55);
    const st: MachineState = reason.category === 'Q' ? 'HOLD' : reason.category === 'M' || reason.category === 'H' ? 'IDLE' : 'DOWN';
    const untag = rnd() < 0.04 && t0 > ctx.now - 36 * H;
    pushEvent(ctx, a, st, t0, t0 + dur, b, phase, untag ? 'U000' : reason.code, /E10|R101/.test(reason.code) ? 'Auto: vacuum > USL' : a.kind === 'continuous' ? 'Auto: feed = 0' : a.kind === 'cyclic' ? 'PLC step' : 'Auto: state');
    t0 += dur;
  }
  runSeg(runMs - consumed);
  return t0;
}

function simulateAsset(ctx: Ctx, a: Asset) {
  let tNow = ctx.from - uni(2, 30) * H; // start before window so window opens mid-activity
  let crash = 1; let isoBase: Batch | null = null;
  while (tNow < ctx.now) {
    // --- gap before next batch/campaign
    const gapKind = rnd();
    const idleP = a.kind === 'continuous' ? 0.45 : a.kind === 'cyclic' ? 0.06 : a.kind === 'batch' ? 0.25 : 0;
    const noschP = a.kind === 'drying' ? 1 : a.kind === 'batch' ? 0.35 : 0;
    if (gapKind < noschP) {
      const g = a.kind === 'drying' ? uni(1, 10) * H : uni(0.5, 6) * H;
      pushEvent(ctx, a, 'NOSCH', tNow, tNow + g, null, null, null, 'Schedule'); tNow += g;
    } else if (gapKind < noschP + idleP) {
      const reason = a.line === 'L1' ? (a.id.includes('EXT') ? 'M101' : 'M103') : 'M102';
      const g = lognormal((a.kind === 'continuous' ? 1.0 : a.kind === 'cyclic' ? 2.0 : 0.6) * H, 0.5);
      pushEvent(ctx, a, 'IDLE', tNow, tNow + g, null, null, reasonsFor(a).some(x => x.code === reason) ? reason : 'M301', 'Auto: no batch'); tNow += g;
    }
    // --- a batch / campaign / cycle
    const [lo, hi] = a.batchSizeKg;
    const idealCycleH = a.phases.filter(p => (p.state ?? 'RUN') === 'RUN').reduce((s, p) => s + p.idealH, 0);
    const isIso = a.id.startsWith('L2-ISO');
    const inputKg = a.kind === 'continuous' ? 0 : round(isIso && crash > 1 && isoBase ? isoBase.inputKg * [1, 0.45, 0.22, 0.1][crash - 1] : uni(lo, hi), 1);
    const b: Batch = { id: batchId(a, tNow, isIso ? crash : undefined), assetId: a.id, line: a.line, product: a.product, start: tNow, end: null, inputKg, outputKg: null, goodKg: null, theoreticalKg: 0, firstPass: null, parentIds: [], crash: isIso ? crash : undefined, idealCycleH, phases: [], metrics: {} };
    if (isIso && crash === 1) isoBase = b;
    if (isIso && crash > 1 && isoBase) b.parentIds.push(isoBase.id);
    let massIn = 0;
    for (const p of a.phases) {
      const st = p.state ?? 'RUN';
      const pStart = tNow;
      if (st === 'PLAN') {
        const code = a.id.includes('WFE') ? (rnd() < 0.12 ? 'P302' : 'P202') : a.id.includes('LLE') ? 'P102' : 'P201';
        const d = lognormal(p.idealH * H, 0.2);
        pushEvent(ctx, a, 'PLAN', tNow, tNow + d, b, p.name, code, 'Schedule'); tNow += d;
      } else {
        let idealMs = p.idealH * H;
        if (a.kind === 'continuous' && /STEADY|CONTACT|RECOVERY/.test(p.name)) idealMs = uni(0.8, 1.35) * p.idealH * H;
        const perf = a.kind === 'continuous' ? 1 : a.targets.P * (1 + 0.06 * gauss());
        let runMs = idealMs / Math.max(0.45, Math.min(1.08, perf));
        if (a.id === 'L2-ISO-C' && p.name === 'CRASH') runMs *= 1.12; // chiller-limited crash (story)
        tNow = runWithStops(ctx, a, b, p.name, tNow, runMs);
        if (a.kind === 'continuous' && a.ratedRate) massIn += a.ratedRate * a.targets.P * (runMs / H);
      }
      b.phases.push({ name: p.name, start: pStart, end: tNow > ctx.now ? null : tNow, idealH: p.idealH });
      if (tNow > ctx.now) break;
    }
    if (a.kind === 'continuous') b.inputKg = round(massIn, 1);
    const complete = tNow <= ctx.now;
    b.end = complete ? tNow : null;
    // yields & quality
    const yieldFrac: Record<string, [number, number]> = { EXT: [0.96, 0.99], LLE: [0.9, 0.97], SRU: [0.92, 0.97], CRY: [0.84, 0.93], FIL: [0.97, 0.995], SLT: [0.9, 0.96], SDR: [0.97, 0.99], '1M': [0.86, 0.92], '2M': [0.68, 0.8], ISO: [0.55, 0.68], RXN: [0.82, 0.92], BUF: [0.96, 0.99], VO: [0.97, 0.995] };
    const key = Object.keys(yieldFrac).find(k => a.id.includes(k))!;
    b.theoreticalKg = round(b.inputKg * (key === 'ISO' ? 0.9 : 1), 1);
    if (complete) {
      b.outputKg = round(b.theoreticalKg * uni(...yieldFrac[key]), 2);
      if (a.kind === 'continuous') { const qf = Math.max(0.6, Math.min(1, a.targets.Q + 0.035 * gauss())); b.goodKg = round(b.outputKg * qf, 2); b.firstPass = qf >= 0.97; }
      else { b.firstPass = rnd() < a.targets.Q; b.goodKg = b.firstPass ? b.outputKg : 0; }
      b.metrics.yieldPct = b.theoreticalKg ? round(100 * b.outputKg / b.theoreticalKg, 1) : 0;
      if (!b.firstPass) {
        const [code, label, disp] = pick(qlFor(a.id));
        const at = tNow - uni(0.2, 2) * H;
        const qty = a.kind === 'continuous' ? round(b.outputKg - (b.goodKg ?? 0), 1) : round((b.outputKg || 10) * uni(0.4, 1), 1);
        const open = at > ctx.now - 30 * H;
        ctx.ql.push({ id: `QL-${a.line}-${pad(ctx.ql.length + 1, 5)}`, line: a.line, assetId: a.id, stage: a.stage, batchId: b.id, at, shift: shiftOf(at), reasonCode: code, reasonLabel: label, evidence: disp === 'SCRAP' ? 'Operator report + photo' : `HPLC ${code.startsWith('QL1') ? 'QC-HPLC-01' : 'QC-HPLC-01'} result below spec`, qtyKg: qty, disposition: open ? 'HOLD' : disp, recoveredKg: open || disp === 'SCRAP' || disp === 'HOLD' ? null : round(qty * uni(0.85, 0.96), 1), status: open ? 'On Hold' : disp === 'HOLD' ? 'Dispositioned' : 'Closed', raisedBy: pick(PEOPLE[shiftOf(at)].ops), dispositionedBy: open ? null : PEOPLE.qa, deviationId: null });
      }
      // per-batch endpoint metrics (I-MR SPC)
      if (isIso) b.metrics.crashEndT = round(-20.2 + 0.9 * gauss() + (a.id === 'L2-ISO-C' ? 0.9 : 0), 2);
      if (a.id.startsWith('L2-RXN')) { b.metrics.preAcidT = round(52.4 + 0.9 * gauss() - (a.id === 'L2-RXN-3' && rnd() < 0.25 ? 3 : 0), 2); b.metrics.exoRise = round(18 + 2.5 * gauss(), 1); b.metrics.exoPeakT = round(b.metrics.preAcidT + b.metrics.exoRise, 2); b.metrics.exoTtpMin = round(9 + 1.8 * gauss(), 1); b.metrics.cookInBandPct = round(Math.min(100, 97 + 2 * gauss()), 1); b.metrics.wash3PH = round(7.1 + 0.25 * gauss(), 2); }
      if (a.id.startsWith('L1-CRY')) { const age = (ctx.now - b.start) / (24 * H); b.metrics.finalPH = round(9.6 + 0.09 * gauss() + (a.id === 'L1-CRY-02' ? 0.18 * (1 - age / 30) : 0), 2); b.metrics.holdH = round(4.2 + 0.5 * gauss(), 2); }
    }
    ctx.batches.push(b);
    if (isIso) { crash = crash >= (rnd() < 0.5 ? 2 : rnd() < 0.5 ? 3 : 4) ? 1 : crash + 1; }
  }
}

function injectStories(ctx: Ctx) {
  // 1) WFE-2M: ongoing vacuum downtime since 07:42 today, tagged E102 by J. Alvarez
  const start = ctx.now - (16 + 20 / 60 - (7 + 42 / 60)) * H;
  const cut = (id: string, at: number) => { for (const e of ctx.events) if (e.assetId === id && e.start < at && (e.end ?? ctx.now) > at) e.end = at; for (let i = ctx.events.length - 1; i >= 0; i--) if (ctx.events[i].assetId === id && ctx.events[i].start >= at) ctx.events.splice(i, 1); };
  cut('L2-WFE-2M', start);
  const b2 = [...ctx.batches].reverse().find(b => b.assetId === 'L2-WFE-2M' && b.start < start);
  if (b2) { b2.end = null; b2.outputKg = null; b2.firstPass = null; }
  ctx.events.push({ id: `EV-L2-${pad(++evSeq, 6)}`, assetId: 'L2-WFE-2M', line: 'L2', state: 'DOWN', start, end: null, batchId: b2?.id ?? null, phase: 'STEADY FEED', product: 'CBD Distillate', reasonCode: 'E102', taggedBy: 'J. Alvarez', taggedAt: start + 13 * MIN, detectedBy: 'Auto: vacuum > USL', expectedQty: 0, actualQty: 0, remarks: 'Vacuum 0.184 mbar and rising. Pump oil dark - maintenance called.' });
  // 2) L1-LLE-01 untagged stop ended 14:05
  const s2 = ctx.now - (16 + 20 / 60 - (13 + 31 / 60)) * H, e2 = ctx.now - (16 + 20 / 60 - (14 + 5 / 60)) * H;
  for (const e of ctx.events) if (e.assetId === 'L1-LLE-01' && e.state === 'RUN' && e.start < s2 && (e.end ?? ctx.now) > e2) { const oldEnd = e.end; e.end = s2; ctx.events.push({ ...e, id: `EV-L1-${pad(++evSeq, 6)}`, state: 'DOWN', start: s2, end: e2, reasonCode: 'U000', taggedBy: null, taggedAt: null, detectedBy: 'Auto: flow = 0', expectedQty: 0, actualQty: 0 }); ctx.events.push({ ...e, id: `EV-L1-${pad(++evSeq, 6)}`, start: e2, end: oldEnd }); break; }
  // 3) outdoor pad network loss (DISC) back-filled, 2 days ago 03:10-03:34
  const d0 = ctx.now - (2 * 24 + 13 + 10 / 60) * H;
  for (const id of ['L1-EXT-T01', 'L1-EXT-T02', 'L1-EXT-T03', 'L1-EXT-T04']) ctx.events.push({ id: `EV-L1-${pad(++evSeq, 6)}`, assetId: id, line: 'L1', state: 'DISC', start: d0 - 30 * MIN, end: d0 - 6 * MIN, batchId: null, phase: null, product: null, reasonCode: 'X201', taggedBy: null, taggedAt: null, detectedBy: 'Edge heartbeat', expectedQty: null, actualQty: null, backfilled: true, remarks: 'Edge buffer back-filled 24 min of PLC data after reconnect' });
  // 4) ISO-C live batch: crash running slow (chiller-limited) -> outside golden tunnel, DEV raised
  const iso = A('L2-ISO-C');
  const lastDone = [...ctx.batches].filter(b => b.assetId === iso.id && b.end !== null && b.end < ctx.now - 18 * H).pop();
  const isoStart = lastDone?.end ?? ctx.now - 22 * H;
  cut(iso.id, isoStart);
  for (let i = ctx.batches.length - 1; i >= 0; i--) if (ctx.batches[i].assetId === iso.id && ctx.batches[i].start >= isoStart) ctx.batches.splice(i, 1);
  const T1 = Math.max(isoStart, ctx.now - 19.9 * H);
  pushEvent(ctx, iso, 'NOSCH', isoStart, T1, null, null, null, 'Schedule');
  const live: Batch = { id: batchId(iso, T1, 1), assetId: iso.id, line: 'L2', product: iso.product, start: T1, end: null, inputKg: 36.4, outputKg: null, goodKg: null, theoreticalKg: 32.8, firstPass: null, parentIds: [], crash: 1, idealCycleH: 30, phases: [], metrics: { slowCrash: 0.25 } };
  const plan: [string, number, number][] = [['CHARGE', 1, 1], ['DISSOLVE', 2, 2], ['CONTROLLED COOL', 6.4, 6], ['CRASH', 99, 7]];
  let tp = T1;
  for (const [name, h, idealH] of plan) { const pe = tp + h * H; pushEvent(ctx, iso, 'RUN', tp, pe, live, name, null, 'Auto: state'); live.phases.push({ name, start: tp, end: pe >= ctx.now ? null : pe, idealH }); tp = pe; }
  ctx.batches.push(live);
  const upstream = [...ctx.batches].filter(b => b.assetId === 'L2-WFE-2M' && b.end !== null && b.end < T1).pop(); if (upstream) live.parentIds.push(upstream.id);
  ctx.events.sort((x, y) => x.assetId.localeCompare(y.assetId) || x.start - y.start);
}

// ---------------------------------------------------------------- deviations, logbooks, escalations
function buildDeviations(ctx: Ctx): Deviation[] {
  const out: Deviation[] = []; let n = 118;
  const add = (d: Omit<Deviation, 'id'>) => out.push({ id: `DEV-${d.line}-${pad(++n)}`, ...d });
  for (const b of ctx.batches) {
    if (b.metrics.crashEndT !== undefined && b.metrics.crashEndT > -18) add({ line: 'L2', assetId: b.assetId, batchId: b.id, phase: 'CRASH', tagKey: 'CRASH_END_T', limitType: 'Spec', limit: -18, worst: b.metrics.crashEndT, start: b.phases.find(p => p.name === 'HOLD')?.start ?? b.start, end: b.end, severity: 'Critical', status: b.end ? 'Closed' : 'Open', assignedTo: PEOPLE.qa, escalationLevel: 2, rootCause: b.end ? 'Chiller return temp high (E302)' : null, capaId: b.end ? `CAPA-26-${pad(n, 3)}` : null, linkedDowntimeId: null });
    if (b.metrics.preAcidT !== undefined && (b.metrics.preAcidT < 50 || b.metrics.preAcidT > 55)) add({ line: 'L2', assetId: b.assetId, batchId: b.id, phase: 'ACID IN', tagKey: 'PRE_ACID_T', limitType: 'Spec', limit: b.metrics.preAcidT < 50 ? 50 : 55, worst: b.metrics.preAcidT, start: b.phases.find(p => p.name === 'ACID IN')?.start ?? b.start, end: b.end, severity: 'Major', status: b.end ? 'Closed' : 'Acknowledged', assignedTo: PEOPLE.B.sup, escalationLevel: 2, rootCause: b.end ? 'Acid added before jacket reached setpoint' : null, capaId: null, linkedDowntimeId: null });
    if (b.metrics.finalPH !== undefined && (b.metrics.finalPH > 9.9 || b.metrics.finalPH < 9.3)) add({ line: 'L1', assetId: b.assetId, batchId: b.id, phase: 'DOSE', tagKey: 'PH', limitType: 'Spec', limit: b.metrics.finalPH > 9.9 ? 9.9 : 9.3, worst: b.metrics.finalPH, start: b.phases.find(p => p.name === 'DOSE')?.end ?? b.start, end: b.end, severity: 'Major', status: b.end ? 'Closed' : 'Open', assignedTo: PEOPLE.A.sup, escalationLevel: 2, rootCause: b.end ? 'pH probe drift - recalibrated (P304)' : null, capaId: null, linkedDowntimeId: null });
  }
  // story: ISO-C live batch outside golden tunnel
  const iso = ctx.batches.find(b => b.assetId === 'L2-ISO-C' && b.end === null);
  const crashP = iso?.phases.find(p => p.name === 'CRASH');
  if (iso && crashP) { const partial = { events: ctx.events, batches: ctx.batches, meta: { to: ctx.now } } as unknown as DemoDataset; const gt = goldenTunnel(partial, 'L2-ISO', 'T_INT', 40); const crashBand = gt.status === 'ok' ? gt.band.find(x => x.phase === 'CRASH') : undefined; add({ line: 'L2', assetId: 'L2-ISO-C', batchId: iso.id, phase: 'CRASH', tagKey: 'T_INT', limitType: 'Golden', limit: round(crashBand ? crashBand.pts[crashBand.pts.length - 1].hi : -19, 1), worst: round(valueAt(partial, 'L2-ISO-C', 'T_INT', ctx.now - MIN), 1), start: crashP.start + 3.5 * H, end: null, severity: 'Major', status: 'Acknowledged', assignedTo: PEOPLE.A.sup, escalationLevel: 2, rootCause: null, capaId: null, linkedDowntimeId: null }); }
  // story: WFE-2M vacuum spec breach linked to ongoing downtime
  const dt = ctx.events.find(e => e.assetId === 'L2-WFE-2M' && e.end === null);
  add({ line: 'L2', assetId: 'L2-WFE-2M', batchId: dt?.batchId ?? null, phase: 'STEADY FEED', tagKey: 'VAC_PV', limitType: 'Spec', limit: 0.05, worst: 0.184, start: dt?.start ?? ctx.now - 8 * H, end: null, severity: 'Critical', status: 'Under investigation', assignedTo: PEOPLE.pm, escalationLevel: 4, rootCause: null, capaId: null, linkedDowntimeId: dt?.id ?? null });
  // control-rule / minor deviations sprinkled
  for (let i = 0; i < 26; i++) { const a = pick(ASSETS.filter(x => TAGS.some(t => t.assetId === x.id && t.spc === 'xbar-r'))); const tag = pick(TAGS.filter(t => t.assetId === a.id && t.spc === 'xbar-r')); const s = Math.round((ctx.from + rnd() * (ctx.now - ctx.from - 2 * H)) / 1000) * 1000; add({ line: a.line, assetId: a.id, batchId: null, phase: null, tagKey: tag.key, limitType: 'Control', limit: tag.usl ?? tag.target ?? 0, worst: round((tag.usl ?? tag.target ?? 1) * 1.01, 3), start: s, end: s + Math.round(uni(5, 40)) * MIN, severity: 'Minor', status: 'Closed', assignedTo: PEOPLE[shiftOf(s)].sup, escalationLevel: 1, rootCause: pick(['Setpoint change during shift', 'Sensor noise', 'Feed composition change', 'Operator adjustment']), capaId: null, linkedDowntimeId: null }); }
  return out.sort((x, y) => y.start - x.start);
}

export const TEMPLATES: LogbookTemplate[] = [
  { formNo: 'FOR-BIP-009', title: '1M Distillation Log', revision: 'Rev. 2', effective: '2025-11-17', assets: ['L2-WFE-1M'], level: 'entry', everyH: 2, demo: false },
  { formNo: 'FOR-BIP-010', title: '2M Distillation Log', revision: 'Rev. 2', effective: '2025-11-17', assets: ['L2-WFE-2M'], level: 'entry', everyH: 2, demo: false },
  { formNo: 'FOR-BIP-004', title: 'Isolation Log', revision: 'Rev. 7', effective: '2026-01-16', assets: ['L2-ISO-A', 'L2-ISO-B', 'L2-ISO-C', 'L2-ISO-D', 'L2-ISO-E'], level: 'batch', demo: false },
  { formNo: 'FOR-BIP-003', title: 'D8 Log', revision: 'Rev. 4', effective: '2026-02-05', assets: ['L2-RXN-1', 'L2-RXN-3'], level: 'batch', demo: false },
  { formNo: 'FOR-KRT-101', title: 'Extraction Cycle Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-EXT-T01', 'L1-EXT-T02', 'L1-EXT-T03', 'L1-EXT-T04'], level: 'batch', demo: true },
  { formNo: 'FOR-KRT-102', title: 'LLE / Solvent Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-LLE-01', 'L1-SRU-01'], level: 'entry', everyH: 4, demo: true },
  { formNo: 'FOR-KRT-103', title: 'Crystallization Batch Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-CRY-01', 'L1-CRY-02', 'L1-FIL-01'], level: 'batch', demo: true },
  { formNo: 'FOR-KRT-104', title: 'Drum & Weigh Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-FIL-01'], level: 'event', demo: true },
  { formNo: 'FOR-KRT-105', title: 'Salt Run Log', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ['L1-SLT-01', 'L1-SDR-01'], level: 'batch', demo: true },
  { formNo: 'LOG-SHIFT', title: 'Shift Handover', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: [], level: 'shift', demo: true },
  { formNo: 'LOG-EQ-DAILY', title: 'Daily Equipment Checklist', revision: 'Rev. A (demo)', effective: '2026-09-01', assets: ASSETS.map(a => a.id), level: 'day', demo: true },
];

function stateAt(ctx: Ctx, assetId: string, t0: number) { return eventAt({ events: ctx.events, batches: ctx.batches, meta: { to: ctx.now } }, assetId, t0); }

function buildLogbooks(ctx: Ctx, series: (a: string, k: string, t: number) => number): LogbookEntry[] {
  const out: LogbookEntry[] = []; let n = 0;
  const statusFor = (due: number): LogbookEntry['status'] => { const age = ctx.now - due; if (age < 0) return 'Due'; if (age < 20 * MIN) return rnd() < 0.5 ? 'Submitted' : 'Due'; if (age < 12 * H) return rnd() < 0.08 ? 'Overdue' : rnd() < 0.6 ? 'Reviewed' : 'Submitted'; return rnd() < 0.015 ? 'Returned' : 'Approved'; };
  const signers = (s: LogbookEntry['status'], sh: ShiftId) => ({ operator: s === 'Due' || s === 'Overdue' ? null : pick(PEOPLE[sh].ops), reviewer: s === 'Reviewed' || s === 'Approved' ? PEOPLE[sh].sup : null, approver: s === 'Approved' ? PEOPLE.qa : null });
  // FOR-BIP-009/010 two-hour checks while WFE is in STEADY FEED (last 7 days to keep size sane)
  for (const id of ['L2-WFE-1M', 'L2-WFE-2M']) {
    const is1 = id.endsWith('1M'); const tagSet = ['WIPER_PV', 'FEED_PV', 'VAC_PV', 'EVAP_PV', 'COND_PV', 'CHL_PV'];
    for (let due = Math.ceil((ctx.now - 7 * 24 * H) / (2 * H)) * 2 * H; due <= ctx.now + 2 * H; due += 2 * H) {
      const ev = stateAt(ctx, id, Math.min(due, ctx.now - 1));
      if (!ev || ev.phase !== 'STEADY FEED') continue;
      const sh = shiftOf(due), status = statusFor(due);
      const fields: LogbookEntry['fields'] = tagSet.map(k => { const tg = TAGS.find(x => x.assetId === id && x.key === k)!; const v = due <= ctx.now ? round(series(id, k, due), k === 'VAC_PV' ? 3 : 1) : null; return { key: k, label: tg.label, value: v, unit: tg.unit, source: 'Controller' as Source, outOfLimit: v !== null && ((tg.usl !== undefined && v > tg.usl) || (tg.lsl !== undefined && v < tg.lsl)) }; });
      fields.push({ key: 'INITIALS', label: 'Operator acknowledgement', value: status === 'Due' || status === 'Overdue' ? null : true, source: 'Manual' });
      const e: LogbookEntry = { id: `LB-${pad(++n, 6)}`, formNo: is1 ? 'FOR-BIP-009' : 'FOR-BIP-010', assetId: id, batchId: ev.batchId, shift: sh, dueAt: due, submittedAt: status === 'Due' || status === 'Overdue' ? null : due + uni(1, 14) * MIN, status, ...signers(status, sh), fields, corrections: [] };
      if (status === 'Approved' && rnd() < 0.05) e.corrections.push({ key: 'CHL_PV', old: '-1.5', new: '-15', reason: 'Transcription error - sign omitted', by: e.operator!, at: e.submittedAt! + 20 * MIN });
      out.push(e);
    }
  }
  // batch-level forms
  for (const b of ctx.batches.filter(b => b.start > ctx.now - 10 * 24 * H)) {
    const tpl = TEMPLATES.find(x => x.level === 'batch' && x.assets.includes(b.assetId)); if (!tpl) continue;
    const sh = shiftOf(b.start), status: LogbookEntry['status'] = b.end === null ? 'Due' : b.end > ctx.now - 6 * H ? 'Submitted' : b.end > ctx.now - 30 * H ? 'Reviewed' : 'Approved';
    const fields: LogbookEntry['fields'] = [
      { key: 'INPUT_KG', label: 'Input mass', value: b.inputKg, unit: 'kg', source: 'Scale' },
      ...b.phases.map(p => ({ key: `T_${p.name}`, label: `${p.name} start`, value: new Date(p.start).toISOString(), source: (b.assetId.includes('EXT') ? 'PLC' : 'Controller') as Source })),
      ...Object.entries(b.metrics).map(([k, v]) => ({ key: k, label: k, value: v, source: 'Calculated' as Source, outOfLimit: (k === 'crashEndT' && v > -18) || (k === 'preAcidT' && (v < 50 || v > 55)) || (k === 'finalPH' && (v < 9.3 || v > 9.9)) })),
      { key: 'VISUAL', label: 'Visual check (colour / dryness / material condition)', value: b.end ? 'Conforms' : null, source: 'Manual' },
      { key: 'OUTPUT_KG', label: 'Output mass', value: b.outputKg, unit: 'kg', source: 'Scale' },
    ];
    out.push({ id: `LB-${pad(++n, 6)}`, formNo: tpl.formNo, assetId: b.assetId, batchId: b.id, shift: sh, dueAt: b.end ?? ctx.now, submittedAt: status === 'Due' ? null : (b.end ?? ctx.now) + 25 * MIN, status, ...signers(status, sh), fields, corrections: [] });
  }
  // daily checklist: WFE-2M vacuum-pump oil check missed on shift B for the last 3 days (story)
  for (let d = 0; d < 7; d++) for (const sh of ['A', 'B'] as ShiftId[]) {
    const due = ctx.now - d * 24 * H - (sh === 'A' ? 4.3 : -1.7) * H; if (due > ctx.now) continue;
    const missed = sh === 'B' && d >= 1 && d <= 3;
    out.push({ id: `LB-${pad(++n, 6)}`, formNo: 'LOG-EQ-DAILY', assetId: 'L2-WFE-2M', batchId: null, shift: sh, dueAt: due, submittedAt: missed ? null : due - 40 * MIN, status: missed ? 'Overdue' : 'Approved', operator: missed ? null : pick(PEOPLE[sh].ops), reviewer: missed ? null : PEOPLE[sh].sup, approver: missed ? null : PEOPLE.pm, fields: [{ key: 'VP_OIL', label: 'Vacuum pump oil level / colour', value: missed ? null : 'OK - amber', source: 'Manual' }, { key: 'CHL_GLYCOL', label: 'Chiller glycol level', value: missed ? null : 'OK', source: 'Manual' }, { key: 'COLD_TRAP', label: 'Cold trap condition', value: missed ? null : 'Clear', source: 'Manual' }], corrections: [] });
  }
  return out.sort((x, y) => y.dueAt - x.dueAt);
}

function buildEscalations(ctx: Ctx, devs: Deviation[]): Escalation[] {
  const out: Escalation[] = []; let n = 0;
  for (const e of ctx.events) {
    const a = A(e.assetId); if (e.state !== 'DOWN' && e.state !== 'IDLE') continue;
    const dur = (e.end ?? ctx.now) - e.start; const thr = a.isConstraint ? [30 * MIN, 2 * H, 8 * H] : [60 * MIN, 4 * H, Infinity];
    if (dur < thr[0]) continue;
    const lvl = (dur >= thr[2] ? 4 : dur >= thr[1] ? 3 : 2) as 2 | 3 | 4;
    const notified = [pick(PEOPLE[shiftOf(e.start)].ops), PEOPLE[shiftOf(e.start)].sup, ...(lvl >= 3 ? [PEOPLE.pm] : []), ...(lvl >= 4 ? [PEOPLE.head] : [])];
    const ack = e.end === null && lvl === 4 ? null : e.start + uni(4, 28) * MIN;
    out.push({ id: `ESC-${pad(++n, 5)}`, trigger: `Unplanned stop ${a.isConstraint ? 'on constraint asset' : ''} (${e.reasonCode ?? 'U000'})`.replace('  ', ' '), entityId: e.id, levelReached: lvl, startedAt: e.start, ackAt: ack, ackBy: ack ? PEOPLE[shiftOf(e.start)].sup : null, notified, slaMet: ack !== null && ack - e.start <= 30 * MIN });
  }
  for (const d of devs.filter(d => d.severity !== 'Minor')) out.push({ id: `ESC-${pad(++n, 5)}`, trigger: `${d.severity} deviation ${d.tagKey}`, entityId: d.id, levelReached: d.escalationLevel, startedAt: d.start, ackAt: d.status === 'Open' ? null : d.start + uni(3, 20) * MIN, ackBy: d.status === 'Open' ? null : d.assignedTo, notified: [PEOPLE[shiftOf(d.start)].sup, PEOPLE.qa, ...(d.severity === 'Critical' ? [PEOPLE.pm] : [])], slaMet: d.status !== 'Open' });
  return out.sort((x, y) => y.startedAt - x.startedAt);
}

// ---------------------------------------------------------------- series (lazy, deterministic)
const IDX = new WeakMap<object, { ev: Map<string, StateEvent[]>; b: Map<string, Batch> }>();
function index(ds: { events: StateEvent[]; batches: Batch[] }) {
  let ix = IDX.get(ds.events);
  if (!ix) { const ev = new Map<string, StateEvent[]>(); for (const e of ds.events) { if (!ev.has(e.assetId)) ev.set(e.assetId, []); ev.get(e.assetId)!.push(e); } for (const l of ev.values()) l.sort((x, y) => x.start - y.start); ix = { ev, b: new Map(ds.batches.map(b => [b.id, b])) }; IDX.set(ds.events, ix); }
  return ix;
}
/** O(log n) lookup of the state event covering t0 */
export function eventAt(ds: { events: StateEvent[]; batches: Batch[]; meta: { to: number } }, assetId: string, t0: number): StateEvent | undefined {
  const l = index(ds).ev.get(assetId); if (!l) return undefined;
  let lo = 0, hi = l.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (l[m].start <= t0) { ans = m; lo = m + 1; } else hi = m - 1; }
  for (let i = ans; i >= 0 && i >= ans - 3; i--) if ((l[i].end ?? ds.meta.to) > t0 && l[i].state !== 'MICRO') return l[i];
  return ans >= 0 && (l[ans].end ?? ds.meta.to) > t0 ? l[ans] : undefined;
}
function phaseCtx(ds: { events: StateEvent[]; batches: Batch[]; meta: { to: number } }, assetId: string, t0: number) {
  const ev = eventAt(ds, assetId, t0);
  const b = ev?.batchId ? index(ds).b.get(ev.batchId) : undefined;
  const p = b?.phases.find(x => x.start <= t0 && (x.end ?? ds.meta.to) > t0);
  const f = p ? (p.end === null ? (t0 - p.start) / (p.idealH * H) : Math.min(1, (t0 - p.start) / Math.max(1, p.end - p.start))) : 0;
  return { ev, b, phase: p?.name ?? ev?.phase ?? null, f, pStart: p?.start ?? 0 };
}
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

export function valueAt(ds: Pick<DemoDataset, 'events' | 'batches' | 'meta'>, assetId: string, key: string, t0: number): number {
  const { ev, b, phase, f, pStart } = phaseCtx(ds, assetId, t0);
  const n = (amp: number, period?: number) => amp * smoothNoise(t0, assetId + key, period);
  const running = ev?.state === 'RUN' || ev?.state === 'MICRO';
  const tg = TAGS.find(x => x.assetId === assetId && x.key === key);
  const daysAgo = (ds.meta.to - t0) / (24 * H);
  if (assetId.includes('WFE')) {
    const is1 = assetId.endsWith('1M'); const sp = tg?.target ?? 0;
    const steady = phase === 'STEADY FEED';
    const vacIssue = ev && (ev.state === 'DOWN' && /E10|R101/.test(ev.reasonCode ?? ''));
    switch (key) {
      case 'EVAP_PV': { const bias = !is1 && shiftOf(t0) === 'B' ? 3.0 * (1 - daysAgo / 40) : 0; if (phase === 'WARM-UP') return lerp(60, sp, f) + n(0.6); if (!ev || ev.state === 'NOSCH' || ev.state === 'PLAN' || ev.state === 'IDLE') return 60 + n(2); return sp + bias + n(is1 ? 1.1 : 1.6) + white(t0, assetId + key) * (is1 ? 0.6 : 2.2); }
      case 'VAC_PV': { if (vacIssue) { const k = Math.min(1, (t0 - ev!.start) / (40 * MIN)); return is1 ? lerp(1.0, 3.2, k) + n(0.2) : lerp(0.03, 0.184, k) + n(0.006); } if (phase === 'VAC PULL-DOWN') return (is1 ? 1 : 0.02) * Math.pow(50, 1 - f); if (!steady && !running) return is1 ? 900 : 900; return (is1 ? 0.8 : 0.021) * Math.exp(0.22 * n(1.4)); }
      case 'FEED_PV': return steady && ev?.state === 'RUN' ? (A(assetId).ratedRate! * A(assetId).targets.P) * (1 + 0.04 * smoothNoise(t0, assetId + key)) : 0;
      case 'FEED_T': return steady ? sp + n(1.3) : 25 + n(1);
      case 'COND_PV': return running ? sp + n(0.7) : 25 + n(1);
      case 'WIPER_PV': return running || vacIssue ? 300 + n(4) : 0;
      case 'CHL_PV': return sp + n(0.8) + (ev?.reasonCode === 'E302' ? 6 : 0);
    }
  }
  if (assetId.startsWith('L2-ISO')) {
    const T = (() => { switch (phase) { case 'CHARGE': return 22; case 'DISSOLVE': return lerp(22, 55, Math.min(1, f * 1.6)); case 'CONTROLLED COOL': return lerp(55, 20, f); case 'CRASH': { const slow = b?.metrics.slowCrash ?? 1; return 20 - 41 * (1 - Math.exp(-3.2 * f * slow)) / (1 - Math.exp(-3.2)); } case 'HOLD': return (b?.metrics.crashEndT ?? -20.3); case 'TRANSFER/FILTER': return lerp(-19, -8, f); case 'RINSE': return -8; default: return 20; } })();
    if (key === 'T_INT') return T + n(0.35);
    if (key === 'T_JKT') return (phase === 'DISSOLVE' ? T + 8 : phase === 'CONTROLLED COOL' || phase === 'CRASH' ? T - 9 : phase === 'HOLD' ? T - 3 : T) + n(0.8);
    if (key === 'AGIT') return phase && phase !== 'CLEAN' ? 80 + n(3) : 0;
  }
  if (assetId.startsWith('L2-RXN')) {
    const pre = b?.metrics.preAcidT ?? 52.5, rise = b?.metrics.exoRise ?? 18, ttp = (b?.metrics.exoTtpMin ?? 9) * MIN;
    if (key === 'T_INT') { switch (phase) { case 'CHARGE': return 25 + n(0.3); case 'HEAT': return lerp(25, pre, Math.min(1, f * 1.3)) + n(0.3); case 'ACID IN': return pre + n(0.25); case 'EXOTHERM': { const dt = t0 - pStart; return (dt < ttp ? pre + rise * Math.sin((dt / ttp) * Math.PI / 2) : pre + rise - (pre + rise - 90) * Math.min(1, (dt - ttp) / (12 * MIN))) + n(0.3); } case 'COOK': return 90 + n(1.4); case 'WASH 1': case 'WASH 2': case 'WASH 3': return 45 + n(1); case 'DRAIN': return 38 + n(1); default: return 24 + n(1); } }
  }
  if (assetId.startsWith('L1-CRY')) {
    const endPH = b?.metrics.finalPH ?? 9.6;
    if (key === 'PH') switch (phase) { case 'CHARGE': return 6.8 + n(0.05); case 'DOSE': return lerp(6.8, endPH, Math.pow(f, 0.7)) + n(0.04); case 'COOL': case 'HOLD': case 'DISCHARGE': return endPH + n(0.03); default: return 7 + n(0.1); }
    if (key === 'T_INT') switch (phase) { case 'CHARGE': case 'DOSE': return 22 + n(0.5); case 'COOL': return lerp(22, 5, f) + n(0.3); case 'HOLD': return 5 + n(0.4); case 'DISCHARGE': return 6 + n(0.5); default: return 20 + n(1); }
    if (key === 'DOSE_RATE') return phase === 'DOSE' ? 12 + n(0.9) : 0;
  }
  if (assetId.startsWith('L1-EXT')) {
    switch (key) {
      case 'LVL': return phase === 'FILL' ? lerp(5, 90, f) : phase === 'SOAK' ? 90 + n(0.5) : phase === 'RECIRC' ? 88 + n(0.8) : phase === 'DRAIN' ? lerp(88, 5, f) : 5;
      case 'TEMP': return phase === 'SOAK' || phase === 'RECIRC' ? 60 + n(1.4) : 30 + n(3);
      case 'PH': return phase ? 3.5 + n(0.15) : 6 + n(0.2);
      case 'RECIRC_FLOW': return phase === 'RECIRC' && running ? 180 + n(8) : 0;
    }
  }
  if (tg && running) return (tg.target ?? 0) + n(((tg.usl ?? (tg.target ?? 1) * 1.1) - (tg.lsl ?? (tg.target ?? 1) * 0.9)) / 10) + (key === 'COND_OUT' ? 4 * Math.max(0, Math.sin(((etHour(t0) - 9) / 24) * 2 * Math.PI)) : 0);
  return tg?.target !== undefined ? (key.includes('FLOW') ? 0 : 25 + n(1)) : 0;
}

export function getSeries(ds: DemoDataset, assetId: string, key: string, from: number, to: number, stepSec = 60) {
  const t: number[] = [], v: number[] = [];
  for (let x = from; x <= Math.min(to, ds.meta.to); x += stepSec * 1000) { t.push(x); v.push(round(valueAt(ds, assetId, key, x), key === 'VAC_PV' ? 4 : 2)); }
  return { t, v };
}

// ---------------------------------------------------------------- analytics
export function computeOee(ds: DemoDataset, q: { assetIds: string[]; from: number; to: number; shift?: ShiftId }) {
  let ppt = 0, planned = 0, unplanned = 0, run = 0, ideal = 0, good = 0, total = 0;
  const slice = (s: number, e: number) => { if (!q.shift) return Math.max(0, Math.min(e, q.to) - Math.max(s, q.from)); let sum = 0; for (let x = Math.max(s, q.from); x < Math.min(e, q.to); x += 5 * MIN) if (shiftOf(x) === q.shift) sum += Math.min(5 * MIN, Math.min(e, q.to) - x); return sum; };
  for (const e of ds.events) {
    if (!q.assetIds.includes(e.assetId)) continue;
    const d = slice(e.start, e.end ?? ds.meta.to); if (!d) continue;
    if (e.state === 'NOSCH' || e.state === 'DISC') continue;
    ppt += d;
    if (e.state === 'PLAN') planned += d; else if (e.state === 'RUN') run += d; else unplanned += d;
    if (e.state === 'RUN') { const a = A(e.assetId); const frac = d / Math.max(1, (e.end ?? ds.meta.to) - e.start); if (a.kind === 'continuous') ideal += (e.actualQty ?? 0) * frac / a.ratedRate! * H; }
  }
  for (const b of ds.batches) {
    if (!q.assetIds.includes(b.assetId)) continue;
    const a = A(b.assetId);
    if (a.kind !== 'continuous') for (const p of b.phases) { const def = a.phases.find(x => x.name === p.name); if ((def?.state ?? 'RUN') !== 'RUN') continue; const pe = p.end ?? ds.meta.to; const ov = slice(p.start, pe); if (ov > 0) ideal += p.idealH * H * ov / Math.max(1, pe - p.start); }
    if (b.end === null || b.end < q.from || b.end > q.to) continue; if (q.shift && shiftOf(b.end) !== q.shift) continue;
    total += b.outputKg ?? 0; good += b.goodKg ?? 0;
  }
  const available = ppt - planned;
  const Av = available ? run / available : 0, Pf = run ? Math.min(1, ideal / run) : 0, Qu = total ? good / total : 1;
  return { availability: Av, performance: Pf, quality: Qu, oee: Av * Pf * Qu, hours: { ppt: ppt / H, planned: planned / H, unplanned: unplanned / H, run: run / H }, kg: { total, good } };
}

export function capability(values: number[], lsl?: number, usl?: number, n = 1) {
  const N = values.length; if (N < 10) return null;
  const mean = values.reduce((s, x) => s + x, 0) / N;
  const sOverall = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (N - 1));
  let sWithin: number;
  if (n > 1) { const d2: Record<number, number> = { 2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534 }; const rs: number[] = []; for (let i = 0; i + n <= N; i += n) { const g = values.slice(i, i + n); rs.push(Math.max(...g) - Math.min(...g)); } sWithin = rs.reduce((s, x) => s + x, 0) / rs.length / d2[n]; }
  else { let mr = 0; for (let i = 1; i < N; i++) mr += Math.abs(values[i] - values[i - 1]); sWithin = mr / (N - 1) / 1.128; }
  const two = lsl !== undefined && usl !== undefined;
  const k = (s: number) => Math.min(usl !== undefined ? (usl - mean) / (3 * s) : Infinity, lsl !== undefined ? (mean - lsl) / (3 * s) : Infinity);
  return { n: N, mean, sigmaWithin: sWithin, sigmaOverall: sOverall, cp: two ? (usl! - lsl!) / (6 * sWithin) : null, cpk: k(sWithin), pp: two ? (usl! - lsl!) / (6 * sOverall) : null, ppk: k(sOverall), indicative: N < 30, ucl: mean + 3 * sWithin, lcl: mean - 3 * sWithin };
}

/** Golden tunnel on phase-aligned time. Returns per-phase arrays of {median, lo, hi} with `points` samples per phase. */
export function goldenTunnel(ds: DemoDataset, assetPrefix: string, key: string, points = 60) {
  const cands = ds.batches.filter(b => b.assetId.startsWith(assetPrefix) && b.end !== null && b.firstPass && (b.crash ?? 1) === 1);
  if (cands.length < 8) return { status: 'Insufficient history' as const, n: cands.length };
  const score = (b: Batch) => b.metrics.yieldPct ?? 0; const golden = [...cands].sort((x, y) => score(y) - score(x)).slice(0, Math.max(8, Math.floor(cands.length / 4)));
  const phases = A(golden[0].assetId).phases.filter(p => (p.state ?? 'RUN') === 'RUN').map(p => p.name);
  const band = phases.map(name => { const rows = golden.map(b => { const p = b.phases.find(x => x.name === name); if (!p || p.end === null) return null; return Array.from({ length: points }, (_, i) => valueAt(ds, b.assetId, key, p.start + (i + 0.5) / points * (p.end! - p.start))); }).filter(Boolean) as number[][]; return { phase: name, pts: Array.from({ length: points }, (_, i) => { const col = rows.map(r => r[i]).sort((x, y) => x - y); const q = (p: number) => col[Math.min(col.length - 1, Math.max(0, Math.round(p * (col.length - 1))))]; return { median: q(0.5), lo: q(0.05), hi: q(0.95) }; }) }; });
  return { status: 'ok' as const, n: golden.length, batchIds: golden.map(b => b.id), band };
}

// ---------------------------------------------------------------- entry point
export function buildDemoDataset(opts: { seed?: number; days?: number; now?: string } = {}): DemoDataset {
  const seed = opts.seed ?? 2609; rnd = mulberry32(seed); evSeq = 0; for (const k of Object.keys(counters)) delete counters[k];
  const now = Date.parse(opts.now ?? '2026-09-22T16:20:00-04:00');
  const from = now - (opts.days ?? 30) * 24 * H;
  const ctx: Ctx = { from, to: now, now, events: [], batches: [], ql: [] };
  for (const a of ASSETS) simulateAsset(ctx, a);
  injectStories(ctx);
  // genealogy links (L1: CRY <- totes, SLT <- drums; L2: 2M <- 1M, ISO <- 2M, RXN <- ISO, VO <- ISO)
  const by = (p: string) => ctx.batches.filter(b => b.assetId.startsWith(p));
  const link = (child: string, parent: string) => { const P = by(parent); for (const c of by(child)) { const up = P.filter(p => p.end !== null && p.end <= c.start).slice(-2); c.parentIds.push(...up.map(u => u.id)); } };
  link('L1-CRY', 'L1-LLE'); link('L1-FIL', 'L1-CRY'); link('L1-SLT', 'L1-FIL'); link('L1-SDR', 'L1-SLT'); link('L1-LLE', 'L1-EXT');
  link('L2-WFE-2M', 'L2-WFE-1M'); link('L2-ISO', 'L2-WFE-2M'); link('L2-RXN', 'L2-VO'); link('L2-BUF', 'L2-ISO'); link('L2-VO', 'L2-BUF');
  const partial = { events: ctx.events, batches: ctx.batches, meta: { to: now } } as unknown as DemoDataset;
  const deviations = buildDeviations(ctx);
  const logbookEntries = buildLogbooks(ctx, (a, k, x) => valueAt(partial, a, k, x));
  const escalations = buildEscalations(ctx, deviations);
  // link quality losses to deviations where natural
  for (const q of ctx.ql) { const d = deviations.find(d => d.batchId === q.batchId); if (d) q.deviationId = d.id; }
  return { meta: { seed, generatedFor: 'OBX Roxboro demo', from, to: now, tz: 'America/New_York', synthetic: true }, assets: ASSETS, tags: TAGS, reasons: REASONS, batches: ctx.batches, events: ctx.events, qualityLosses: ctx.ql, deviations, logbookTemplates: TEMPLATES, logbookEntries, escalations };
}
