import type { MachineState } from '../data/types';

export interface StateMeta {
  code: MachineState;
  label: string;
  fill: string;
  /** Highcharts pattern-fill path id for the decal, null = solid (design theme §1). */
  decal: 'none' | 'dots' | 'diagonal' | 'back-diagonal' | 'horizontal' | 'cross';
  icon: string;       // lucide name
  planned: boolean;   // counts as a planned stop
  excluded: boolean;  // excluded from planned production time
}

/** Single source of truth for state colour + pattern + icon + label (never colour alone). */
export const STATES: Record<MachineState, StateMeta> = {
  RUN:   { code: 'RUN',   label: 'Running',            fill: '#1E9E5A', decal: 'none',          icon: 'play',          planned: false, excluded: false },
  MICRO: { code: 'MICRO', label: 'Micro-stop',         fill: '#F2B632', decal: 'dots',          icon: 'zap',           planned: false, excluded: false },
  DOWN:  { code: 'DOWN',  label: 'Unplanned down',     fill: '#E5484D', decal: 'none',          icon: 'octagon-alert', planned: false, excluded: false },
  PLAN:  { code: 'PLAN',  label: 'Planned',            fill: '#6E56CF', decal: 'diagonal',      icon: 'wrench',        planned: true,  excluded: false },
  IDLE:  { code: 'IDLE',  label: 'Idle / starved',     fill: '#8B98A9', decal: 'horizontal',    icon: 'pause',         planned: false, excluded: false },
  HOLD:  { code: 'HOLD',  label: 'Quality / lab hold', fill: '#EA7A1A', decal: 'cross',         icon: 'flask-conical', planned: false, excluded: false },
  NOSCH: { code: 'NOSCH', label: 'Not scheduled',      fill: '#E3E8EF', decal: 'none',          icon: 'moon',          planned: false, excluded: true  },
  DISC:  { code: 'DISC',  label: 'Disconnected',       fill: '#5B6776', decal: 'back-diagonal', icon: 'wifi-off',      planned: false, excluded: true  },
};

export const stateMeta = (s: MachineState): StateMeta => STATES[s] ?? STATES.IDLE;

/** States that consume availability inside planned production time. */
export const UNPLANNED_STATES: MachineState[] = ['DOWN', 'IDLE', 'HOLD', 'MICRO'];

export const isUnplanned = (s: MachineState) => UNPLANNED_STATES.includes(s);

/** Order used by legends, stacked bars and the loss waterfall. */
export const STATE_ORDER: MachineState[] = ['RUN', 'DOWN', 'MICRO', 'IDLE', 'HOLD', 'PLAN', 'DISC', 'NOSCH'];

/** Reason-tree category metadata (ref 01 §6) - drives Pareto grouping and chip colour. */
export const CATEGORIES: Record<string, { label: string; colour: string; icon: string }> = {
  P:   { label: 'Planned',              colour: '#6E56CF', icon: 'wrench' },
  E:   { label: 'Equipment failure',    colour: '#E5484D', icon: 'octagon-alert' },
  R:   { label: 'Process',              colour: '#EA7A1A', icon: 'flask-conical' },
  M:   { label: 'Material & logistics', colour: '#B7791F', icon: 'package' },
  U:   { label: 'Utilities',            colour: '#0F766E', icon: 'plug-zap' },
  Q:   { label: 'Quality',              colour: '#7A4FD0', icon: 'microscope' },
  H:   { label: 'People',               colour: '#4A5B70', icon: 'users' },
  X:   { label: 'External',             colour: '#5B6776', icon: 'cloud-lightning' },
  UNK: { label: 'Unassigned',           colour: '#8B98A9', icon: 'help-circle' },
};

export const categoryMeta = (c: string) => CATEGORIES[c] ?? CATEGORIES.UNK;

/** Severity chip styling (design theme §1 semantic). */
export const SEVERITY = {
  Minor:    { fg: '#B7791F', bg: '#FDF3D8' },
  Major:    { fg: '#C2410C', bg: '#FFEDD5' },
  Critical: { fg: '#FFFFFF', bg: '#B42318' },
} as const;

/** Source badge styling (hard rule 3). */
export const SOURCE_BADGE: Record<string, { icon: string; colour: string }> = {
  PLC:         { icon: 'cpu',           colour: '#1655F2' },
  Controller:  { icon: 'gauge',         colour: '#1655F2' },
  Scale:       { icon: 'scale',         colour: '#1655F2' },
  Manual:      { icon: 'pencil',        colour: '#7A4FD0' },
  Calculated:  { icon: 'sigma',         colour: '#4A5B70' },
  'LIMS/COA':  { icon: 'flask-conical', colour: '#0F766E' },
  ERP:         { icon: 'database',      colour: '#4A5B70' },
};

/** Data-state badges: "Today: DS3 -> Demo: Connected" (ref 01 §0). */
export const DATA_STATE: Record<string, { label: string; colour: string }> = {
  DS1: { label: 'Structured digital',      colour: '#0F766E' },
  DS2: { label: 'Manual (electronic)',     colour: '#1655F2' },
  DS3: { label: 'Displayed, not retained', colour: '#B7791F' },
  DS4: { label: 'Not measured today',      colour: '#D92D20' },
  DSP: { label: 'Paper record',            colour: '#7A889A' },
};
