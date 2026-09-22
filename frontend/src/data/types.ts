// OBX x Faclon demo - domain types. All timestamps are epoch ms (UTC); render in America/New_York.

export type LineId = 'L1' | 'L2';
export type ShiftId = 'A' | 'B';
export type DataState = 'DS1' | 'DS2' | 'DS3' | 'DS4' | 'DSP';
export type Source = 'PLC' | 'Controller' | 'Scale' | 'Manual' | 'Calculated' | 'LIMS/COA' | 'ERP';

export type MachineState = 'RUN' | 'MICRO' | 'DOWN' | 'PLAN' | 'IDLE' | 'HOLD' | 'NOSCH' | 'DISC';
export type AssetKind = 'continuous' | 'batch' | 'cyclic' | 'drying';
export type ReasonCategory = 'P' | 'E' | 'R' | 'M' | 'U' | 'Q' | 'H' | 'X' | 'UNK';
export type Disposition = 'HOLD' | 'REWORK' | 'DOWNGRADE' | 'SCRAP';
export type Severity = 'Minor' | 'Major' | 'Critical';
export type DeviationStatus = 'Open' | 'Acknowledged' | 'Under investigation' | 'Action taken' | 'Closed';
export type LimitType = 'Spec' | 'Control' | 'Golden';
export type Role = 'Operator' | 'Shift Supervisor' | 'Production Manager' | 'QA' | 'Plant Head' | 'Admin';

export interface PhaseDef { name: string; idealH: number; state?: MachineState } // state defaults to RUN

export interface Asset {
  id: string;              // e.g. 'L2-WFE-2M'
  name: string;            // e.g. '2M WFE Distillation'
  line: LineId;
  area: 'Outdoor Pad' | 'Kratom Process Room' | 'Bulk Suite';
  stage: string;           // OBX stage label
  kind: AssetKind;
  isConstraint: boolean;
  product: string;         // default product name
  ratedRate?: number;      // continuous: kg/h or L/h
  rateUnit?: 'kg/h' | 'L/h';
  phases: PhaseDef[];      // ISA-88 phases in order
  batchSizeKg: [number, number];
  record: string;          // form number
  targets: { A: number; P: number; Q: number }; // generator calibration targets
}

export interface TagDef {
  assetId: string;
  key: string;             // e.g. 'EVAP_PV'
  label: string;
  unit: string;
  source: Source;
  dataStateToday: DataState;
  sampleSec: number;
  target?: number;
  lsl?: number;
  usl?: number;
  demoLimit: boolean;      // true = pending OBX Quality
  spc: 'xbar-r' | 'i-mr' | 'none';
  golden: boolean;
  critical: boolean;       // Quality-critical -> Critical severity on breach
}

export interface Reason { code: string; category: ReasonCategory; group: string; label: string; lines: LineId[]; assetMatch?: RegExp; weight: number; medianMin: number; }

export interface Batch {
  id: string;              // OBX genealogy ID
  assetId: string;
  line: LineId;
  product: string;
  start: number;
  end: number | null;      // null = in progress
  inputKg: number;
  outputKg: number | null;
  goodKg: number | null;   // first-pass good mass (OEE quality numerator)
  theoreticalKg: number;
  firstPass: boolean | null;
  parentIds: string[];     // upstream lots/totes/batches
  crash?: number;          // ISO crash no.
  idealCycleH: number;
  phases: { name: string; start: number; end: number | null; idealH: number }[];
  metrics: Record<string, number>; // per-batch endpoints for I-MR SPC, e.g. crashEndT, preAcidT, exoPeakT, finalPH, yieldPct
}

export interface StateEvent {
  id: string;
  assetId: string;
  line: LineId;
  state: MachineState;
  start: number;
  end: number | null;      // null = Ongoing
  batchId: string | null;
  phase: string | null;
  product: string | null;
  reasonCode: string | null;   // null for RUN; 'U000' untagged
  taggedBy: string | null;
  taggedAt: number | null;
  detectedBy: string;          // 'Auto: vacuum > USL' | 'Auto: feed = 0' | 'PLC step' | 'Manual'
  expectedQty: number | null;
  actualQty: number | null;
  backfilled?: boolean;        // DISC replaced from edge buffer
  remarks?: string;
}

export interface QualityLoss {
  id: string; line: LineId; assetId: string; stage: string; batchId: string; at: number; shift: ShiftId;
  reasonCode: string; reasonLabel: string; evidence: string; qtyKg: number; disposition: Disposition;
  recoveredKg: number | null; status: 'Open' | 'On Hold' | 'Dispositioned' | 'Closed';
  raisedBy: string; dispositionedBy: string | null; deviationId: string | null;
}

export interface Deviation {
  id: string; line: LineId; assetId: string; batchId: string | null; phase: string | null;
  tagKey: string; limitType: LimitType; limit: number; worst: number; start: number; end: number | null;
  severity: Severity; status: DeviationStatus; assignedTo: string; escalationLevel: 1 | 2 | 3 | 4;
  rootCause: string | null; capaId: string | null; linkedDowntimeId: string | null;
}

export interface LogbookTemplate { formNo: string; title: string; revision: string; effective: string; assets: string[]; level: 'entry' | 'batch' | 'shift' | 'day' | 'event'; everyH?: number; demo: boolean; }

export interface LogbookEntry {
  id: string; formNo: string; assetId: string; batchId: string | null; shift: ShiftId; dueAt: number; submittedAt: number | null;
  status: 'Due' | 'Overdue' | 'Submitted' | 'Reviewed' | 'Approved' | 'Returned';
  operator: string | null; reviewer: string | null; approver: string | null;
  fields: { key: string; label: string; value: string | number | boolean | null; unit?: string; source: Source; outOfLimit?: boolean; section?: string; row?: number }[];
  corrections: { key: string; old: string; new: string; reason: string; by: string; at: number }[];
}

export interface Escalation { id: string; trigger: string; entityId: string; levelReached: 1 | 2 | 3 | 4; startedAt: number; ackAt: number | null; ackBy: string | null; notified: string[]; slaMet: boolean; }

export interface DemoDataset {
  meta: { seed: number; generatedFor: string; from: number; to: number; tz: 'America/New_York'; synthetic: true };
  assets: Asset[]; tags: TagDef[]; reasons: Reason[];
  batches: Batch[]; events: StateEvent[]; qualityLosses: QualityLoss[]; deviations: Deviation[];
  logbookTemplates: LogbookTemplate[]; logbookEntries: LogbookEntry[]; escalations: Escalation[];
}
