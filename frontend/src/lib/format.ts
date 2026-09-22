/** Number & unit formatting. Units always travel with the value (hard rule: units in every header). */

export function num(v: number | null | undefined, dp = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function int(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return Math.round(v).toLocaleString('en-US');
}

/** `55.8%` - 1 dp per design theme §2. */
export const pct = (frac: number | null | undefined, dp = 1): string =>
  frac === null || frac === undefined || !Number.isFinite(frac) ? '-' : `${(frac * 100).toFixed(dp)}%`;

/** Percentage already expressed 0-100. */
export const pctRaw = (v: number | null | undefined, dp = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(dp)}%`;

/** Signed delta for KPI tiles: `+2.4` / `-1.1`. */
export const signed = (v: number, dp = 1): string => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}`;

/** Capability indices print at 2 dp (`0.87`). */
export const cpk = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : v.toFixed(2);

/**
 * Significant decimals for a process value, by unit.
 * Vacuum on WFE-2M runs at 0.020 mbar - 1 dp would erase the signal.
 */
export function valueDp(unit: string): number {
  switch (unit) {
    case 'mbar': return 3;
    case 'pH': return 2;
    case '-': return 2;
    case 'degC': case 'kg/h': case 'L/min': case 'L/h': case '%': case 'kg': case 'L': return 1;
    case 'rpm': case 'ppm': case 'min': case 'inHg': return 0;
    default: return 1;
  }
}

/** `176.4 degC` - degC rendered as °C for display. */
export function withUnit(v: number | null | undefined, unit: string, dp?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return `${v.toFixed(dp ?? valueDp(unit))} ${unitLabel(unit)}`;
}

export const unitLabel = (u: string) => (u === 'degC' ? '°C' : u);

/** Empty categorical cells read `-`, never blank (ref 02 / UI-07). */
export const dash = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '-' : String(v);
