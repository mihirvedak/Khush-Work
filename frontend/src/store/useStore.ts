import { create } from 'zustand';
import { buildDataset } from '../data/index';
import type { DemoDataset, LineId, ShiftId, Role, Disposition } from '../data/types';
import { HOUR, DAY, startOfShift, startOfEtDay, shiftAt, TZ } from '../lib/time';
import { formatInTimeZone } from 'date-fns-tz';

/** Built once at module load (~160 ms) and never mutated (ref 07 §2). */
export const DS: DemoDataset = buildDataset();

/** Demo "now" - 2026-09-22 16:20 ET. The ticker advances an offset; the dataset is never regenerated. */
export const BASE_NOW = DS.meta.to;

export type RangeKey =
  | 'custom' | 'currentShift' | 'last24h' | 'today' | 'yesterday'
  | 'currentWeek' | 'previousWeek' | 'previous7Days'
  | 'currentMonth' | 'previousMonth' | 'previous3Months' | 'previous12Months'
  | 'currentYear' | 'previousYear';

export interface Range { from: number; to: number; key: RangeKey; label: string }

/** Start of the ET week (Sunday), matching the calendar grid. */
function startOfEtWeek(t: number): number {
  const d0 = startOfEtDay(t);
  const dow = Number(formatInTimeZone(t, TZ, 'i')) % 7; // 1=Mon..7=Sun -> 0=Sun
  return d0 - dow * DAY;
}

function startOfEtMonth(t: number, monthsBack = 0): number {
  const y = Number(formatInTimeZone(t, TZ, 'yyyy'));
  const m = Number(formatInTimeZone(t, TZ, 'M')) - 1 - monthsBack;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return startOfEtDay(new Date(Date.UTC(ny, nm, 1, 12)).getTime());
}

function startOfEtYear(t: number, yearsBack = 0): number {
  const y = Number(formatInTimeZone(t, TZ, 'yyyy')) - yearsBack;
  return startOfEtDay(new Date(Date.UTC(y, 0, 1, 12)).getTime());
}

const VALID_RANGE_KEYS = new Set<string>([
  'custom', 'currentShift', 'last24h', 'today', 'yesterday', 'currentWeek', 'previousWeek',
  'previous7Days', 'currentMonth', 'previousMonth', 'previous3Months', 'previous12Months',
  'currentYear', 'previousYear',
]);

export const isRangeKey = (k: string | null | undefined): k is RangeKey => !!k && VALID_RANGE_KEYS.has(k);

export function resolveRange(rawKey: RangeKey, now: number, custom?: { from: number; to: number }): Range {
  // an unknown key (stale URL, hand-edited link) must never crash the app
  const key: RangeKey = isRangeKey(rawKey) ? rawKey : 'last24h';
  const label = (k: RangeKey) => ({
    custom: 'Custom', currentShift: 'Current Shift', last24h: 'Last 24 Hours', today: 'Today',
    yesterday: 'Yesterday', currentWeek: 'Current Week', previousWeek: 'Previous Week',
    previous7Days: 'Previous 7 Days', currentMonth: 'Current Month', previousMonth: 'Previous Month',
    previous3Months: 'Previous 3 Months', previous12Months: 'Previous 12 Months',
    currentYear: 'Current Year', previousYear: 'Previous Year',
  }[k]);

  const mk = (from: number, to: number): Range => ({ from, to, key, label: label(key) });

  switch (key) {
    case 'currentShift':      return mk(startOfShift(now), now);
    case 'last24h':           return mk(now - DAY, now);
    case 'today':             return mk(startOfEtDay(now), now);
    case 'yesterday':         return mk(startOfEtDay(now) - DAY, startOfEtDay(now));
    case 'currentWeek':       return mk(startOfEtWeek(now), now);
    case 'previousWeek':      return mk(startOfEtWeek(now) - 7 * DAY, startOfEtWeek(now));
    case 'previous7Days':     return mk(now - 7 * DAY, now);
    case 'currentMonth':      return mk(startOfEtMonth(now), now);
    case 'previousMonth':     return mk(startOfEtMonth(now, 1), startOfEtMonth(now));
    case 'previous3Months':   return mk(startOfEtMonth(now, 3), now);
    case 'previous12Months':  return mk(startOfEtMonth(now, 12), now);
    case 'currentYear':       return mk(startOfEtYear(now), now);
    case 'previousYear':      return mk(startOfEtYear(now, 1), startOfEtYear(now));
    case 'custom':            return mk(custom?.from ?? now - DAY, custom?.to ?? now);
  }
}

/** Operator actions live here, never in DS - so Reset makes the demo repeatable (ref 07 §2). */
export interface Overlay {
  /** eventId -> reason tag applied during the demo */
  tags: Record<string, { reasonCode: string; taggedBy: string; taggedAt: number; action?: string; remarks?: string }>;
  /** deviationId -> acknowledgement */
  ackDeviations: Record<string, { by: string; at: number }>;
  /** escalationId -> acknowledgement */
  ackEscalations: Record<string, { by: string; at: number }>;
  /** logbook entry id -> submitted / reviewed / approved signatures */
  signatures: Record<string, { step: string; by: string; at: number; meaning: string }[]>;
  /** logbook entry id -> field key -> value edited in the demo */
  formValues: Record<string, Record<string, string | number | boolean | null>>;
  /** quality loss id -> disposition set during the demo */
  dispositions: Record<string, { disposition: Disposition; by: string; at: number; recoveredKg?: number }>;
  /** downtime events logged by hand from the Data Logger */
  manualDowntime: ManualDowntime[];
  /** rejection / quality-loss records logged by hand from the Data Logger */
  manualRejection: ManualRejection[];
}

export interface ManualDowntime {
  id: string;
  assetId: string;
  line: LineId;
  start: number;
  end: number | null;
  reasonCode: string;
  action?: string;
  remarks?: string;
  shift: ShiftId;
  loggedBy: string;
  loggedAt: number;
}

export interface ManualRejection {
  id: string;
  assetId: string;
  line: LineId;
  at: number;
  batchId: string;
  reasonCode: string;
  reasonLabel: string;
  qtyKg: number;
  disposition: Disposition;
  evidence?: string;
  remarks?: string;
  shift: ShiftId;
  loggedBy: string;
  loggedAt: number;
}

const emptyOverlay = (): Overlay => ({
  tags: {}, ackDeviations: {}, ackEscalations: {}, signatures: {}, formValues: {}, dispositions: {},
  manualDowntime: [], manualRejection: [],
});

interface State {
  // --- global filters (UI-02), synced to the URL ---
  line: LineId | 'ALL';
  assetIds: string[];
  shift: ShiftId | 'ALL';
  rangeKey: RangeKey;
  custom?: { from: number; to: number };
  search: string;

  // --- demo runtime ---
  now: number;
  live: boolean;
  /** accelerated clock for escalation timers: 1 min = 1 h (ref 06 acceptance) */
  fastClock: boolean;
  role: Role;
  user: string;
  theme: 'light' | 'dark';
  /** Bruce AI assistant panel visibility - it floats over any screen */
  bruceOpen: boolean;
  overlay: Overlay;

  setLine: (l: LineId | 'ALL') => void;
  setAssets: (ids: string[]) => void;
  toggleAsset: (id: string) => void;
  setShift: (s: ShiftId | 'ALL') => void;
  setRange: (k: RangeKey, custom?: { from: number; to: number }) => void;
  setSearch: (s: string) => void;
  clearFilters: () => void;

  tick: () => void;
  setLive: (v: boolean) => void;
  setFastClock: (v: boolean) => void;
  setRole: (r: Role) => void;
  setTheme: (t: 'light' | 'dark') => void;
  setBruceOpen: (v: boolean) => void;

  tagEvent: (eventId: string, reasonCode: string, opts?: { action?: string; remarks?: string }) => void;
  ackDeviation: (id: string) => void;
  ackEscalation: (id: string) => void;
  sign: (entryId: string, step: string, meaning: string) => void;
  setFormValue: (entryId: string, key: string, value: string | number | boolean | null) => void;
  setDisposition: (qlId: string, disposition: Disposition, recoveredKg?: number) => void;
  addManualDowntime: (e: Omit<ManualDowntime, 'id' | 'loggedBy' | 'loggedAt' | 'shift'>) => void;
  addManualRejection: (e: Omit<ManualRejection, 'id' | 'loggedBy' | 'loggedAt' | 'shift'>) => void;
  resetDemo: () => void;
}

/** Demo users per role (ref 01 §1). */
export const USER_BY_ROLE: Record<Role, string> = {
  'Operator': 'J. Alvarez',
  'Shift Supervisor': 'R. Ellis',
  'Production Manager': 'A. Whitfield',
  'QA': 'Dr. P. Shah',
  'Plant Head': 'C. Donnelly',
  'Admin': 'Faclon Support',
};

export const useStore = create<State>((set) => ({
  line: 'ALL',
  assetIds: [],
  shift: 'ALL',
  rangeKey: 'last24h',
  search: '',

  now: BASE_NOW,
  live: true,
  fastClock: false,
  role: 'Shift Supervisor',
  user: USER_BY_ROLE['Shift Supervisor'],
  theme: 'light',
  bruceOpen: false,
  overlay: emptyOverlay(),

  setLine: (line) => set({ line, assetIds: [] }),
  setAssets: (assetIds) => set({ assetIds }),
  toggleAsset: (id) => set((s) => ({
    assetIds: s.assetIds.includes(id) ? s.assetIds.filter((a) => a !== id) : [...s.assetIds, id],
  })),
  setShift: (shift) => set({ shift }),
  setRange: (rangeKey, custom) => set({ rangeKey, custom }),
  setSearch: (search) => set({ search }),
  clearFilters: () => set({ line: 'ALL', assetIds: [], shift: 'ALL', rangeKey: 'last24h', search: '' }),

  tick: () => set((s) => (s.live ? { now: s.now + (s.fastClock ? HOUR : 5000) } : {})),
  setLive: (live) => set({ live }),
  setFastClock: (fastClock) => set({ fastClock }),
  setRole: (role) => set({ role, user: USER_BY_ROLE[role] }),
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  setBruceOpen: (bruceOpen) => set({ bruceOpen }),

  tagEvent: (eventId, reasonCode, opts) => set((s) => ({
    overlay: {
      ...s.overlay,
      tags: { ...s.overlay.tags, [eventId]: { reasonCode, taggedBy: s.user, taggedAt: s.now, ...opts } },
    },
  })),
  ackDeviation: (id) => set((s) => ({
    overlay: { ...s.overlay, ackDeviations: { ...s.overlay.ackDeviations, [id]: { by: s.user, at: s.now } } },
  })),
  ackEscalation: (id) => set((s) => ({
    overlay: { ...s.overlay, ackEscalations: { ...s.overlay.ackEscalations, [id]: { by: s.user, at: s.now } } },
  })),
  sign: (entryId, step, meaning) => set((s) => ({
    overlay: {
      ...s.overlay,
      signatures: {
        ...s.overlay.signatures,
        [entryId]: [...(s.overlay.signatures[entryId] ?? []), { step, by: s.user, at: s.now, meaning }],
      },
    },
  })),
  setFormValue: (entryId, key, value) => set((s) => ({
    overlay: {
      ...s.overlay,
      formValues: { ...s.overlay.formValues, [entryId]: { ...(s.overlay.formValues[entryId] ?? {}), [key]: value } },
    },
  })),
  setDisposition: (qlId, disposition, recoveredKg) => set((s) => ({
    overlay: {
      ...s.overlay,
      dispositions: { ...s.overlay.dispositions, [qlId]: { disposition, by: s.user, at: s.now, recoveredKg } },
    },
  })),
  addManualDowntime: (e) => set((s) => ({
    overlay: {
      ...s.overlay,
      manualDowntime: [
        {
          ...e,
          id: `DT-MAN-${String(s.overlay.manualDowntime.length + 1).padStart(4, '0')}`,
          shift: shiftAt(e.start),
          loggedBy: s.user,
          loggedAt: s.now,
        },
        ...s.overlay.manualDowntime,
      ],
    },
  })),
  addManualRejection: (e) => set((s) => ({
    overlay: {
      ...s.overlay,
      manualRejection: [
        {
          ...e,
          id: `QL-MAN-${String(s.overlay.manualRejection.length + 1).padStart(4, '0')}`,
          shift: shiftAt(e.at),
          loggedBy: s.user,
          loggedAt: s.now,
        },
        ...s.overlay.manualRejection,
      ],
    },
  })),
  resetDemo: () => set({ overlay: emptyOverlay(), now: BASE_NOW, live: true, fastClock: false }),
}));

/** Resolved range for the current filter state. */
export const useRange = (): Range => {
  const { rangeKey, custom, now } = useStore();
  return resolveRange(rangeKey, now, custom);
};

/** Assets matching the line + asset filters, in dataset order. */
export const useFilteredAssets = () => {
  const { line, assetIds } = useStore();
  return DS.assets.filter(
    (a) => (line === 'ALL' || a.line === line) && (assetIds.length === 0 || assetIds.includes(a.id)),
  );
};
