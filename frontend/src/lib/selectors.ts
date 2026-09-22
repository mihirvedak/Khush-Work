import type {
  DemoDataset, StateEvent, Batch, QualityLoss, Deviation, LogbookEntry, Escalation, ShiftId, MachineState,
} from '../data/types';
import type { Overlay } from '../store/useStore';
import { isUnplanned, categoryMeta } from './states';
import { msInShift, overlap, MIN, HOUR, dayKey } from './time';

/** An event as the UI sees it: dataset event + any reason tagged during the demo. */
export interface UiEvent extends StateEvent {
  /** resolved end - ongoing events extend to demoNow */
  endOr: number;
  durationMs: number;
  /** true when the reason came from the demo overlay, not the dataset */
  tagOverlay: boolean;
  ongoing: boolean;
}

export function toUiEvent(e: StateEvent, overlay: Overlay, now: number): UiEvent {
  const t = overlay.tags[e.id];
  const endOr = e.end ?? now;
  return {
    ...e,
    reasonCode: t ? t.reasonCode : e.reasonCode,
    taggedBy: t ? t.taggedBy : e.taggedBy,
    taggedAt: t ? t.taggedAt : e.taggedAt,
    remarks: t?.remarks ?? e.remarks,
    endOr,
    durationMs: Math.max(0, endOr - e.start),
    tagOverlay: !!t,
    ongoing: e.end === null,
  };
}

export interface EventQuery {
  assetIds: string[];
  from: number;
  to: number;
  shift?: ShiftId | 'ALL';
  states?: MachineState[];
}

/** Events overlapping the window, clipped by shift when one is selected. */
export function selectEvents(ds: DemoDataset, q: EventQuery, overlay: Overlay, now: number): UiEvent[] {
  const ids = new Set(q.assetIds);
  const out: UiEvent[] = [];
  for (const e of ds.events) {
    if (!ids.has(e.assetId)) continue;
    const end = e.end ?? now;
    if (end <= q.from || e.start >= q.to) continue;
    if (q.states && !q.states.includes(e.state)) continue;
    if (q.shift && q.shift !== 'ALL') {
      // keep the event if any of it falls inside the selected shift
      if (msInShift(Math.max(e.start, q.from), Math.min(end, q.to), q.shift) <= 0) continue;
    }
    out.push(toUiEvent(e, overlay, now));
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Milliseconds of an event inside the window (and shift, if filtered). */
export function eventMsIn(e: UiEvent, q: EventQuery): number {
  const from = Math.max(e.start, q.from);
  const to = Math.min(e.endOr, q.to);
  if (to <= from) return 0;
  return q.shift && q.shift !== 'ALL' ? msInShift(from, to, q.shift) : to - from;
}

/** Time split by machine state across the window - drives KPI strips and legends. */
export function stateSplit(events: UiEvent[], q: EventQuery): Record<MachineState, number> {
  const acc = { RUN: 0, MICRO: 0, DOWN: 0, PLAN: 0, IDLE: 0, HOLD: 0, NOSCH: 0, DISC: 0 } as Record<MachineState, number>;
  for (const e of events) acc[e.state] += eventMsIn(e, q);
  return acc;
}

export interface DowntimeMetrics {
  downtimeMs: number;      // unplanned (DOWN+IDLE+HOLD, excl. micro)
  microMs: number;
  plannedMs: number;
  runMs: number;
  stops: number;           // unplanned stops, excl. micro-stops
  mttrMs: number;
  mtbfMs: number;
  untaggedCount: number;
  untaggedMs: number;
  topReason: { code: string; ms: number } | null;
}

/** MTTR/MTBF/untagged per ref 03 "Metrics". Micro-stops are excluded from MTTR by definition. */
export function downtimeMetrics(events: UiEvent[], q: EventQuery): DowntimeMetrics {
  let downtimeMs = 0, microMs = 0, plannedMs = 0, runMs = 0, stops = 0, untaggedCount = 0, untaggedMs = 0;
  const byReason = new Map<string, number>();
  for (const e of events) {
    const ms = eventMsIn(e, q);
    if (!ms) continue;
    if (e.state === 'RUN') { runMs += ms; continue; }
    if (e.state === 'PLAN') { plannedMs += ms; continue; }
    if (e.state === 'MICRO') { microMs += ms; continue; }
    if (!isUnplanned(e.state)) continue;
    downtimeMs += ms;
    stops += 1;
    const code = e.reasonCode ?? 'U000';
    byReason.set(code, (byReason.get(code) ?? 0) + ms);
    if (code === 'U000') { untaggedCount += 1; untaggedMs += ms; }
  }
  const top = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    downtimeMs, microMs, plannedMs, runMs, stops,
    mttrMs: stops ? downtimeMs / stops : 0,
    mtbfMs: stops ? runMs / stops : 0,
    untaggedCount, untaggedMs,
    topReason: top ? { code: top[0], ms: top[1] } : null,
  };
}

export interface ParetoRow {
  key: string;          // reason code or failure-mode group
  label: string;
  category: string;
  ms: number;
  count: number;
  pct: number;
  cumPct: number;
  colour: string;
}

/**
 * Downtime Pareto. `mode: 'code'` lists individual reasons;
 * `mode: 'mode'` groups by failure mode (first 2 chars, e.g. the E1xx vacuum family)
 * which is what surfaces the vacuum family as L2's #1 loss (ref 01 section 6).
 */
export function pareto(
  events: UiEvent[], q: EventQuery, ds: DemoDataset, mode: 'code' | 'mode' = 'code', limit = 12,
): ParetoRow[] {
  const acc = new Map<string, { ms: number; count: number }>();
  for (const e of events) {
    if (!isUnplanned(e.state) || e.state === 'MICRO') continue;
    const ms = eventMsIn(e, q);
    if (!ms) continue;
    const code = e.reasonCode ?? 'U000';
    const key = mode === 'code' ? code : familyOf(code);
    const cur = acc.get(key) ?? { ms: 0, count: 0 };
    acc.set(key, { ms: cur.ms + ms, count: cur.count + 1 });
  }
  const total = [...acc.values()].reduce((s, x) => s + x.ms, 0) || 1;
  const rows = [...acc.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, limit)
    .map(([key, v]) => {
      const cat = key[0];
      return {
        key,
        label: mode === 'code' ? `${key} ${reasonLabelOf(ds, key)}` : familyLabel(ds, key),
        category: cat,
        ms: v.ms,
        count: v.count,
        pct: v.ms / total,
        cumPct: 0,
        colour: categoryMeta(cat).colour,
      };
    });
  let cum = 0;
  for (const r of rows) { cum += r.pct; r.cumPct = cum; }
  return rows;
}

/** `E102` -> `E1` (vacuum family); `U000` stays whole. */
export const familyOf = (code: string) => (code === 'U000' ? 'U000' : code.slice(0, 2));

export const reasonLabelOf = (ds: DemoDataset, code: string) =>
  code === 'U000' ? 'Untagged' : (ds.reasons.find((r) => r.code === code)?.label ?? code);

export function familyLabel(ds: DemoDataset, family: string): string {
  if (family === 'U000') return 'U000 Untagged';
  const members = ds.reasons.filter((r) => r.code.startsWith(family));
  const group = members[0]?.group ?? categoryMeta(family[0]).label;
  return `${family}xx ${group}`;
}

/** Downtime minutes per asset per ET day - the heatmap in the Downtime Logger. */
export function downtimeHeatmap(events: UiEvent[], q: EventQuery, assetIds: string[]) {
  const days = new Map<string, number>();
  const cells = new Map<string, number>();
  for (const e of events) {
    if (!isUnplanned(e.state)) continue;
    const ms = eventMsIn(e, q);
    if (!ms) continue;
    const d = dayKey(e.start);
    days.set(d, 1);
    const k = `${e.assetId}|${d}`;
    cells.set(k, (cells.get(k) ?? 0) + ms);
  }
  const dayList = [...days.keys()].sort();
  const data: [number, number, number][] = [];
  assetIds.forEach((a, yi) => {
    dayList.forEach((d, xi) => {
      data.push([xi, yi, Math.round((cells.get(`${a}|${d}`) ?? 0) / MIN)]);
    });
  });
  return { days: dayList, assets: assetIds, data };
}

/** Shift-wise downtime, stacked by category - A vs B per day. */
export function shiftStack(events: UiEvent[], q: EventQuery) {
  const days = new Map<string, Record<string, { A: number; B: number }>>();
  for (const e of events) {
    if (!isUnplanned(e.state)) continue;
    const cat = (e.reasonCode ?? 'U000')[0];
    // split the event across shifts so a stop crossing 18:00 is attributed correctly
    for (const sh of ['A', 'B'] as ShiftId[]) {
      const ms = msInShift(Math.max(e.start, q.from), Math.min(e.endOr, q.to), sh);
      if (!ms) continue;
      const d = dayKey(e.start);
      if (!days.has(d)) days.set(d, {});
      const row = days.get(d)!;
      if (!row[cat]) row[cat] = { A: 0, B: 0 };
      row[cat][sh] += ms;
    }
  }
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ------------------------------------------------------------------ quality loss

export interface QualityMetrics {
  totalKg: number;
  reworkKg: number;
  scrapKg: number;
  holdKg: number;
  downgradeKg: number;
  holdLots: number;
  recoveredKg: number;
  events: number;
}

export function qualityMetrics(losses: QualityLoss[]): QualityMetrics {
  const m: QualityMetrics = {
    totalKg: 0, reworkKg: 0, scrapKg: 0, holdKg: 0, downgradeKg: 0, holdLots: 0, recoveredKg: 0, events: losses.length,
  };
  for (const q of losses) {
    m.totalKg += q.qtyKg;
    m.recoveredKg += q.recoveredKg ?? 0;
    if (q.disposition === 'REWORK') m.reworkKg += q.qtyKg;
    else if (q.disposition === 'SCRAP') m.scrapKg += q.qtyKg;
    else if (q.disposition === 'DOWNGRADE') m.downgradeKg += q.qtyKg;
    else if (q.disposition === 'HOLD') { m.holdKg += q.qtyKg; m.holdLots += 1; }
  }
  return m;
}

export function selectQualityLosses(
  ds: DemoDataset, q: { assetIds: string[]; from: number; to: number; shift?: ShiftId | 'ALL' }, overlay: Overlay,
): QualityLoss[] {
  const ids = new Set(q.assetIds);
  return ds.qualityLosses
    .filter((x) => ids.has(x.assetId) && x.at >= q.from && x.at < q.to)
    .filter((x) => !q.shift || q.shift === 'ALL' || x.shift === q.shift)
    .map((x) => {
      const d = overlay.dispositions[x.id];
      return d
        ? {
            ...x,
            disposition: d.disposition,
            dispositionedBy: d.by,
            recoveredKg: d.recoveredKg ?? x.recoveredKg,
            status: 'Dispositioned' as const,
          }
        : x;
    })
    .sort((a, b) => b.at - a.at);
}

// ------------------------------------------------------------------ deviations

export function selectDeviations(
  ds: DemoDataset, q: { assetIds: string[]; from: number; to: number }, overlay: Overlay,
): Deviation[] {
  const ids = new Set(q.assetIds);
  return ds.deviations
    .filter((d) => ids.has(d.assetId) && (d.end ?? q.to) >= q.from && d.start < q.to)
    .map((d) => (overlay.ackDeviations[d.id] && d.status === 'Open' ? { ...d, status: 'Acknowledged' as const } : d))
    .sort((a, b) => b.start - a.start);
}

export const openDeviations = (ds: DemoDataset, overlay: Overlay) =>
  ds.deviations.filter((d) => (d.status !== 'Closed' && !overlay.ackDeviations[d.id]) || d.end === null);

// ------------------------------------------------------------------ logbooks

/** Entry status, recomputed against demo-now so "Due" becomes "Overdue" as the clock runs. */
export function entryStatus(e: LogbookEntry, overlay: Overlay, now: number): LogbookEntry['status'] {
  const sigs = overlay.signatures[e.id] ?? [];
  if (sigs.some((s) => s.step === 'Approve')) return 'Approved';
  if (sigs.some((s) => s.step === 'Review')) return 'Reviewed';
  if (sigs.some((s) => s.step === 'Perform')) return 'Submitted';
  if (e.status === 'Due' && e.dueAt < now - 10 * MIN) return 'Overdue';
  return e.status;
}

export function selectLogbookEntries(
  ds: DemoDataset,
  q: { assetIds: string[]; from: number; to: number; shift?: ShiftId | 'ALL'; formNo?: string },
  overlay: Overlay, now: number,
): (LogbookEntry & { uiStatus: LogbookEntry['status'] })[] {
  const ids = new Set(q.assetIds);
  return ds.logbookEntries
    .filter((e) => ids.has(e.assetId))
    .filter((e) => e.dueAt >= q.from && e.dueAt < q.to)
    .filter((e) => !q.shift || q.shift === 'ALL' || e.shift === q.shift)
    .filter((e) => !q.formNo || e.formNo === q.formNo)
    .map((e) => ({ ...e, uiStatus: entryStatus(e, overlay, now) }))
    .sort((a, b) => b.dueAt - a.dueAt);
}

// ------------------------------------------------------------------ escalations

export interface EscalationMetrics {
  open: number;
  byLevel: Record<number, number>;
  slaAdherence: number;
  meanAckMs: number;
}

export function escalationMetrics(escs: Escalation[], overlay: Overlay): EscalationMetrics {
  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let open = 0, met = 0, ackCount = 0, ackTotal = 0;
  for (const e of escs) {
    const ack = e.ackAt ?? overlay.ackEscalations[e.id]?.at ?? null;
    if (!ack) { open += 1; byLevel[e.levelReached] += 1; }
    else { ackCount += 1; ackTotal += ack - e.startedAt; }
    if (e.slaMet) met += 1;
  }
  return {
    open, byLevel,
    slaAdherence: escs.length ? met / escs.length : 1,
    meanAckMs: ackCount ? ackTotal / ackCount : 0,
  };
}

// ------------------------------------------------------------------ batches & genealogy

export const batchById = (ds: DemoDataset, id: string) => ds.batches.find((b) => b.id === id);

export function selectBatches(ds: DemoDataset, q: { assetIds: string[]; from: number; to: number }): Batch[] {
  const ids = new Set(q.assetIds);
  return ds.batches
    .filter((b) => ids.has(b.assetId) && (b.end ?? q.to) >= q.from && b.start < q.to)
    .sort((a, b) => b.start - a.start);
}

/** Walk parentIds upstream to build the genealogy tree for one batch. */
export function ancestorsOf(ds: DemoDataset, id: string, depth = 6): Batch[] {
  const seen = new Set<string>();
  const out: Batch[] = [];
  const walk = (bid: string, d: number) => {
    if (d > depth || seen.has(bid)) return;
    seen.add(bid);
    const b = batchById(ds, bid);
    if (!b) return;
    out.push(b);
    b.parentIds.forEach((p) => walk(p, d + 1));
  };
  const root = batchById(ds, id);
  root?.parentIds.forEach((p) => walk(p, 1));
  return out;
}

export function descendantsOf(ds: DemoDataset, id: string): Batch[] {
  return ds.batches.filter((b) => b.parentIds.includes(id));
}

export { overlap, HOUR, MIN };
