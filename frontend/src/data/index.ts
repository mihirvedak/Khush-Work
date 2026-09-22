/** App entry point for demo data. Always import from here, not from generator.ts directly. */
import { buildDemoDataset } from './generator';
import { enrichLogbooks } from './forms';
import type { DemoDataset } from './types';

export * from './types';
export { getSeries, valueAt, eventAt, computeOee, capability, goldenTunnel, shiftOf, reasonLabel, ASSETS, TAGS, REASONS, PEOPLE } from './generator';
export { FORMS, formByNo } from './forms';
export type { FormDef, FormSection, FormField, FieldType, Capture, SignoffStep } from './forms';

let cache: DemoDataset | undefined;
/** Deterministic dataset (seed 2609, now 2026-09-22 16:20 ET) with schema-conformant logbook entries. */
export function buildDataset(opts: { seed?: number; days?: number; now?: string } = {}): DemoDataset {
  if (!opts.seed && !opts.days && !opts.now && cache) return cache;
  const ds = enrichLogbooks(buildDemoDataset(opts));
  if (!opts.seed && !opts.days && !opts.now) cache = ds;
  return ds;
}
