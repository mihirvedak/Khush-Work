import type { DemoDataset, TagDef, Batch } from '../data/types';
import { getSeries, capability, eventAt } from '../data/index';

export type CapabilityResult = NonNullable<ReturnType<typeof capability>>;

/** A single plotted SPC point. */
export interface SpcPoint {
  t: number;
  v: number;
  /** batch or subgroup label shown in the tooltip */
  label: string;
  /** Nelson / Western Electric rule numbers this point violates */
  rules: number[];
}

/**
 * Values for a continuous signal restricted to genuine steady operation:
 * the machine must be RUNNING *and* inside one of `phases`. Phase membership alone
 * is not enough - a batch stays in STEADY FEED while the asset is down, and those
 * idle readings would wreck sigma. Mirrors the seed-data calibration method.
 */
export function steadyValues(
  ds: DemoDataset, assetId: string, tagKey: string, from: number, to: number,
  phases?: string[], stepSec = 60, requireRunning = true,
): { t: number[]; v: number[] } {
  const s = getSeries(ds, assetId, tagKey, from, to, stepSec);
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < s.v.length; i++) {
    if (requireRunning || phases) {
      const e = eventAt(ds, assetId, s.t[i]);
      if (requireRunning && e?.state !== 'RUN') continue;
      if (phases && (!e?.phase || !phases.includes(e.phase))) continue;
    }
    t.push(s.t[i]);
    v.push(s.v[i]);
  }
  return { t, v };
}

/**
 * Rational subgroups of `n` consecutive readings - these are the plotted X-bar points.
 * Capability is computed from the raw values (capability() does its own d2 subgrouping),
 * so the chart and the indices stay consistent.
 */
export function subgroupMeans(t: number[], v: number[], n = 5, maxPoints = 600): SpcPoint[] {
  const groups: SpcPoint[] = [];
  for (let i = 0; i + n <= v.length; i += n) {
    const slice = v.slice(i, i + n);
    groups.push({ t: t[i], v: slice.reduce((x, y) => x + y, 0) / n, label: `subgroup of ${n}`, rules: [] });
  }
  if (groups.length <= maxPoints) return groups;
  const stride = Math.ceil(groups.length / maxPoints);   // decimate for rendering only
  return groups.filter((_, i) => i % stride === 0);
}

/**
 * Per-batch endpoint series for I-MR charts: one point per batch/crash
 * (ISO crash endpoint, RXN exotherm peak, CRY final pH, ...).
 */
export function batchEndpoints(
  ds: DemoDataset, assetPrefix: string, metricKey: string, from: number, to: number,
): SpcPoint[] {
  return ds.batches
    .filter((b) => b.assetId.startsWith(assetPrefix))
    .filter((b) => b.end !== null && b.end >= from && b.end <= to)
    .filter((b) => Number.isFinite(b.metrics?.[metricKey]))
    .sort((a, b) => (a.end ?? 0) - (b.end ?? 0))
    .map((b) => ({ t: b.end as number, v: b.metrics[metricKey], label: b.id, rules: [] }));
}

/**
 * Nelson / Western Electric subset used by the demo (ref 05):
 *  1  one point beyond 3 sigma
 *  2  nine consecutive points on one side of the centre line
 *  3  six consecutive points steadily increasing or decreasing (probe drift)
 *  5  two of three consecutive points beyond 2 sigma, same side
 * Mutates and returns `points` with rule numbers attached.
 */
export function applyNelson(points: SpcPoint[], mean: number, sigma: number, enabled = [1, 2, 3, 5]): SpcPoint[] {
  const v = points.map((p) => p.v);
  const on = (r: number) => enabled.includes(r);

  if (on(1)) {
    v.forEach((x, i) => { if (Math.abs(x - mean) > 3 * sigma) points[i].rules.push(1); });
  }
  if (on(2)) {
    let run = 0, side = 0;
    v.forEach((x, i) => {
      const s = x > mean ? 1 : x < mean ? -1 : 0;
      run = s !== 0 && s === side ? run + 1 : 1;
      side = s;
      if (run >= 9) for (let k = i - 8; k <= i; k++) if (!points[k].rules.includes(2)) points[k].rules.push(2);
    });
  }
  if (on(3)) {
    let up = 1, down = 1;
    for (let i = 1; i < v.length; i++) {
      up = v[i] > v[i - 1] ? up + 1 : 1;
      down = v[i] < v[i - 1] ? down + 1 : 1;
      if (up >= 6 || down >= 6) {
        for (let k = i - 5; k <= i; k++) if (!points[k].rules.includes(3)) points[k].rules.push(3);
      }
    }
  }
  if (on(5)) {
    for (let i = 2; i < v.length; i++) {
      const w = [v[i - 2], v[i - 1], v[i]];
      const hi = w.filter((x) => x - mean > 2 * sigma).length;
      const lo = w.filter((x) => mean - x > 2 * sigma).length;
      if (hi >= 2 || lo >= 2) {
        for (let k = i - 2; k <= i; k++) if (!points[k].rules.includes(5)) points[k].rules.push(5);
      }
    }
  }
  return points;
}

export const RULE_TEXT: Record<number, string> = {
  1: 'Rule 1 - point beyond 3 sigma',
  2: 'Rule 2 - 9 points on one side of centre',
  3: 'Rule 3 - 6 points trending (drift)',
  5: 'Rule 5 - 2 of 3 points beyond 2 sigma',
};

/** Moving-range series for the MR panel of an I-MR chart. */
export const movingRange = (points: SpcPoint[]): number[] =>
  points.slice(1).map((p, i) => Math.abs(p.v - points[i].v));

/** Capability verdict wording (design theme UI-14). */
export function verdict(cpkValue: number | null | undefined): { text: string; tone: 'ok' | 'warn' | 'danger' } {
  if (cpkValue === null || cpkValue === undefined || !Number.isFinite(cpkValue)) {
    return { text: 'Not computable', tone: 'warn' };
  }
  if (cpkValue >= 1.33) return { text: 'Capable', tone: 'ok' };
  if (cpkValue >= 1.0) return { text: 'Marginal', tone: 'warn' };
  return { text: 'Not capable', tone: 'danger' };
}

/**
 * 95 % confidence interval for Cpk (Bissell approximation), shown in the tooltip.
 * CI = Cpk +/- z * sqrt( 1/(9 n Cpk^2) + 1/(2(n-1)) )
 */
export function cpkCI(cpkValue: number, n: number, z = 1.96): [number, number] | null {
  if (!Number.isFinite(cpkValue) || n < 10) return null;
  const se = Math.sqrt(1 / (9 * n * cpkValue * cpkValue) + 1 / (2 * (n - 1)));
  return [cpkValue - z * se, cpkValue + z * se];
}

/**
 * Anderson-Darling normality statistic and an approximate p-value.
 * Shown as "Non-normal - interpret with care" when p < 0.05 (ref 05).
 */
export function andersonDarling(values: number[]): { a2: number; p: number } | null {
  const n = values.length;
  if (n < 8) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  if (!sd) return null;
  const Phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
  let s = 0;
  for (let i = 0; i < n; i++) {
    const f1 = Phi((xs[i] - mean) / sd);
    const f2 = Phi((xs[n - 1 - i] - mean) / sd);
    s += (2 * (i + 1) - 1) * (Math.log(clamp(f1)) + Math.log(1 - clamp(f2)));
  }
  const a2 = -n - s / n;
  const a2star = a2 * (1 + 0.75 / n + 2.25 / (n * n));
  // D'Agostino & Stephens p-value approximation
  let p: number;
  if (a2star >= 0.6) p = Math.exp(1.2937 - 5.709 * a2star + 0.0186 * a2star * a2star);
  else if (a2star >= 0.34) p = Math.exp(0.9177 - 4.279 * a2star - 1.38 * a2star * a2star);
  else if (a2star >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * a2star - 59.938 * a2star * a2star);
  else p = 1 - Math.exp(-13.436 + 101.14 * a2star - 223.73 * a2star * a2star);
  return { a2: a2star, p: Math.min(1, Math.max(0, p)) };
}

const clamp = (x: number) => Math.min(1 - 1e-12, Math.max(1e-12, x));

/** Abramowitz & Stegun 7.1.26 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Normal PDF curve across a range, for the capability histogram overlay. */
export function normalCurve(mean: number, sd: number, min: number, max: number, points = 80): [number, number][] {
  const out: [number, number][] = [];
  const step = (max - min) / points;
  for (let x = min; x <= max; x += step) {
    const y = (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mean) ** 2) / (2 * sd * sd));
    out.push([x, y]);
  }
  return out;
}

/** Tags worth charting for an asset. */
export function spcTags(ds: DemoDataset, assetId: string): TagDef[] {
  return ds.tags.filter((t) => t.assetId === assetId && t.spc !== 'none');
}

export const tagOf = (ds: DemoDataset, assetId: string, key: string) =>
  ds.tags.find((t) => t.assetId === assetId && t.key === key);

/** Batches contributing to a golden tunnel, newest first. */
export const goldenBatches = (ds: DemoDataset, ids: string[]): Batch[] =>
  ds.batches.filter((b) => ids.includes(b.id)).sort((a, b) => (b.end ?? 0) - (a.end ?? 0));

export { capability };
