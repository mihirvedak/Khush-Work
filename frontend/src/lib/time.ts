import { formatInTimeZone } from 'date-fns-tz';

/** Plant timezone - every rendered timestamp uses it (hard rule 9). */
export const TZ = 'America/New_York';

/** `2026-09-22 16:20:05` */
export const fmtTs = (t: number) => formatInTimeZone(t, TZ, 'yyyy-MM-dd HH:mm:ss');
/** `2026-09-22 16:20` */
export const fmtTsMin = (t: number) => formatInTimeZone(t, TZ, 'yyyy-MM-dd HH:mm');
/** `16:20` */
export const fmtTime = (t: number) => formatInTimeZone(t, TZ, 'HH:mm');
/** `16:20:05` */
export const fmtTimeSec = (t: number) => formatInTimeZone(t, TZ, 'HH:mm:ss');
/** `22 Sep` */
export const fmtDay = (t: number) => formatInTimeZone(t, TZ, 'dd MMM');
/** `Tue 22 Sep` */
export const fmtDayLong = (t: number) => formatInTimeZone(t, TZ, 'EEE dd MMM');
/** `2026-09-22` - the plant-day key, used to bucket by day in ET */
export const dayKey = (t: number) => formatInTimeZone(t, TZ, 'yyyy-MM-dd');
/** Hour of day in ET (0-23), DST-correct. */
export const etHour = (t: number) => Number(formatInTimeZone(t, TZ, 'H'));

/** Shift from ET wall-clock: A 06:00-18:00, B 18:00-06:00. */
export const shiftAt = (t: number): 'A' | 'B' => (etHour(t) >= 6 && etHour(t) < 18 ? 'A' : 'B');

/**
 * Shift label for an event that may cross the 18:00/06:00 boundary.
 * Downtime events are reported as one event showing `A->B` (ref 02 §rule 3).
 */
export function shiftSpan(start: number, end: number | null, now: number): string {
  const s = shiftAt(start);
  const e = shiftAt(end ?? now);
  return s === e ? s : `${s}->${e}`;
}

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** `03:05:12`, or `1d 03:12:44` past 24 h (ref 02 table). */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

/** Compact duration for KPI strips: `18h42m`, `53m`, `4.2h`. */
export function fmtDurShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalMin = Math.round(ms / MIN);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}m`;
}

export const hours = (ms: number) => ms / HOUR;

/** Start of the ET plant-day containing t. */
export function startOfEtDay(t: number): number {
  const key = dayKey(t);
  // Offset differs across DST; resolve by probing the ET offset at t.
  const offset = formatInTimeZone(t, TZ, 'xxx'); // e.g. -04:00
  return new Date(`${key}T00:00:00${offset}`).getTime();
}

/** Start of the shift containing t (06:00 or 18:00 ET). */
export function startOfShift(t: number): number {
  const d0 = startOfEtDay(t);
  const h = etHour(t);
  if (h < 6) return d0 - 6 * HOUR; // previous day 18:00
  return h < 18 ? d0 + 6 * HOUR : d0 + 18 * HOUR;
}

/** Overlap of [aFrom,aTo) and [bFrom,bTo) in ms. */
export const overlap = (aFrom: number, aTo: number, bFrom: number, bTo: number) =>
  Math.max(0, Math.min(aTo, bTo) - Math.max(aFrom, bFrom));

/**
 * Milliseconds of [from,to) that fall inside shift `shift` (ET), DST-correct.
 * Walks 12-hour shift blocks rather than assuming fixed offsets.
 */
export function msInShift(from: number, to: number, shift: 'A' | 'B'): number {
  let total = 0;
  let cursor = startOfShift(from);
  while (cursor < to) {
    const next = startOfShift(cursor + 13 * HOUR); // safely into the following shift
    if (shiftAt(cursor) === shift) total += overlap(cursor, next, from, to);
    cursor = next;
  }
  return total;
}
