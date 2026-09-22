import { useEffect, useMemo, useState } from 'react';
import type Highcharts from 'highcharts';
import { DS } from '../../store/useStore';
import { capability } from '../../data/index';
import {
  steadyValues, subgroupMeans, batchEndpoints, applyNelson, movingRange, verdict, cpkCI, andersonDarling, normalCurve,
  RULE_TEXT, type SpcPoint,
} from '../../lib/spc';
import { ChartCard } from '../../components/Chart';
import { DemoLimitTag, ObxLimitTag, EmptyState } from '../../components/primitives';
import { Stat } from '../../components/KpiTile';
import { cpk as fmtCpk, unitLabel, valueDp, num } from '../../lib/format';
import { LIMIT_STYLE } from '../../theme/highcharts';
import { fmtTsMin } from '../../lib/time';
import type { TagDef } from '../../data/types';

/** Steady phases per asset family - SPC outside these is meaningless (ref 05). */
const STEADY: Record<string, string[]> = {
  WFE: ['STEADY FEED'],
  EXT: ['SOAK', 'RECIRC'],
  LLE: ['CONTACT'],
  SRU: ['CONTACT', 'STEADY FEED'],
};

/** Per-batch endpoint metrics that get an I-MR chart instead of X-bar/R. */
const ENDPOINT_METRICS: Record<string, { key: string; label: string; unit: string; lsl?: number; usl?: number; obx?: boolean }[]> = {
  ISO: [{ key: 'crashEndT', label: 'Crash endpoint internal temp', unit: 'degC', usl: -18, obx: true }],
  RXN: [
    { key: 'preAcidT', label: 'Pre-acid temperature', unit: 'degC', lsl: 50, usl: 55, obx: true },
    { key: 'exoPeakT', label: 'Exotherm peak temperature', unit: 'degC', usl: 78 },
  ],
  CRY: [{ key: 'finalPH', label: 'Final pH (endpoint)', unit: 'pH', lsl: 9.3, usl: 9.9 }],
};

function familyOf(assetId: string): string {
  for (const k of ['WFE', 'ISO', 'RXN', 'CRY', 'EXT', 'LLE', 'SRU']) if (assetId.includes(k)) return k;
  return '';
}

export function SpcTab({ assetId, from, to }: { assetId: string; from: number; to: number }) {
  const fam = familyOf(assetId);
  const contTags = useMemo(
    () => DS.tags.filter((t) => t.assetId === assetId && t.spc === 'xbar-r'),
    [assetId],
  );
  const endpoints = ENDPOINT_METRICS[fam] ?? [];

  const choices = useMemo(() => [
    ...endpoints.map((e) => ({ kind: 'endpoint' as const, id: e.key, label: e.label })),
    ...contTags.map((t) => ({ kind: 'cont' as const, id: t.key, label: t.label })),
  ], [contTags, endpoints]);

  const [sel, setSel] = useState<string>(choices[0]?.id ?? '');
  const [steadyOnly, setSteadyOnly] = useState(true);

  // when the asset changes the old parameter may not exist - fall back to the first one
  useEffect(() => {
    if (!choices.some((c) => c.id === sel)) setSel(choices[0]?.id ?? '');
  }, [assetId, choices, sel]);

  const choice = choices.find((c) => c.id === sel) ?? choices[0];

  if (!choice) {
    return <EmptyState title="No SPC parameters configured for this asset" hint="Select an instrumented asset such as L2-WFE-2M or L2-ISO-C." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="lbl mr-1">Parameter</span>
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSel(c.id)}
            aria-pressed={sel === c.id}
            className={
              sel === c.id
                ? 'rounded-full border border-azure-600 bg-azure-50 px-2.5 py-1 text-2xs font-semibold text-azure-700'
                : 'rounded-full border border-line px-2.5 py-1 text-2xs text-txt-secondary hover:bg-subtle'
            }
          >
            {c.label}
            {c.kind === 'endpoint' && <span className="ml-1 text-[9px] opacity-70">I-MR</span>}
          </button>
        ))}
        {choice.kind === 'cont' && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-2xs text-txt-secondary">
            <input type="checkbox" checked={steadyOnly} onChange={(e) => setSteadyOnly(e.target.checked)} />
            Steady phase only
          </label>
        )}
      </div>

      {choice.kind === 'endpoint' ? (
        <EndpointChart assetId={assetId} fam={fam} metric={endpoints.find((e) => e.key === choice.id)!} from={from} to={to} />
      ) : (
        <ContinuousChart assetId={assetId} fam={fam} tag={contTags.find((t) => t.key === choice.id)!} from={from} to={to} steadyOnly={steadyOnly} />
      )}
    </div>
  );
}

/** X-bar / R for continuous signals, subgrouped n=5 inside steady phases. */
function ContinuousChart({
  assetId, fam, tag, from, to, steadyOnly,
}: { assetId: string; fam: string; tag: TagDef; from: number; to: number; steadyOnly: boolean }) {
  // Raw 1-min readings, restricted to RUN + steady phase. Capability uses every value;
  // the chart plots decimated subgroup means.
  const { t, v } = useMemo(
    () => steadyValues(DS, assetId, tag.key, from, to, steadyOnly ? STEADY[fam] : undefined, 60, steadyOnly),
    [assetId, tag.key, from, to, fam, steadyOnly],
  );

  const points = useMemo(() => subgroupMeans(t, v, 5), [t, v]);
  const raw = v;

  const capW = useMemo(() => capability(v, tag.lsl, tag.usl, 5), [v, tag]);
  const capOverall = capW;

  const marked = useMemo(
    () => (capW ? applyNelson(points.map((p) => ({ ...p, rules: [] })), capW.mean, capW.sigmaWithin) : points),
    [points, capW],
  );

  if (!capW || v.length < 10) {
    return (
      <EmptyState
        title={`n = ${v.length} readings - need at least 10 for capability`}
        hint={steadyOnly ? 'Try widening the date range, or untick "Steady phase only".' : 'Widen the date range.'}
      />
    );
  }

  return (
    <CapabilityView
      title={`${tag.label} - X-bar / R`}
      subtitle={`n = ${points.length} subgroups of 5 · ${steadyOnly ? 'steady phase only' : 'all phases'} · ${unitLabel(tag.unit)}`}
      points={marked}
      unit={tag.unit}
      lsl={tag.lsl}
      usl={tag.usl}
      target={tag.target}
      capWithin={capW}
      capOverall={capOverall}
      raw={raw}
      demoLimit={tag.demoLimit}
      obxLimit={false}
    />
  );
}

/** I-MR for per-batch endpoints - one point per batch or crash. */
function EndpointChart({
  assetId, fam, metric, from, to,
}: { assetId: string; fam: string; metric: { key: string; label: string; unit: string; lsl?: number; usl?: number; obx?: boolean }; from: number; to: number }) {
  // ISO/RXN endpoints pool across the reactor family; CRY stays per-crystallizer
  const prefix = fam === 'CRY' ? assetId : assetId.slice(0, assetId.lastIndexOf('-'));

  const points = useMemo(() => batchEndpoints(DS, prefix, metric.key, from, to), [prefix, metric.key, from, to]);
  const values = points.map((p) => p.v);
  const cap = useMemo(() => capability(values, metric.lsl, metric.usl, 1), [values, metric]);

  const marked = useMemo(
    () => (cap ? applyNelson(points.map((p) => ({ ...p, rules: [] })), cap.mean, cap.sigmaWithin) : points),
    [points, cap],
  );

  if (!cap) {
    return <EmptyState title={`n = ${points.length} - need at least 10 batches`} hint="Widen the date range to 30 days." />;
  }

  return (
    <CapabilityView
      title={`${metric.label} - I-MR`}
      subtitle={`n = ${points.length} batches · pooled across ${prefix}* · ${unitLabel(metric.unit)}`}
      points={marked}
      unit={metric.unit}
      lsl={metric.lsl}
      usl={metric.usl}
      capWithin={cap}
      capOverall={cap}
      raw={values}
      demoLimit={!metric.obx}
      obxLimit={!!metric.obx}
    />
  );
}

/** Shared control chart + MR panel + capability panel + histogram. */
function CapabilityView({
  title, subtitle, points, unit, lsl, usl, target, capWithin, capOverall, raw, demoLimit, obxLimit,
}: {
  title: string; subtitle: string; points: SpcPoint[]; unit: string;
  lsl?: number; usl?: number; target?: number;
  capWithin: NonNullable<ReturnType<typeof capability>>;
  capOverall: NonNullable<ReturnType<typeof capability>> | null;
  raw: number[];
  demoLimit: boolean; obxLimit: boolean;
}) {
  const dp = valueDp(unit);
  const violations = points.filter((p) => p.rules.length);

  const controlOptions: Highcharts.Options = useMemo(() => ({
    chart: { zooming: { type: 'x' } },
    xAxis: { type: 'datetime', crosshair: true },
    yAxis: {
      title: { text: unitLabel(unit) },
      plotLines: [
        { value: capWithin.mean, ...LIMIT_STYLE.target, label: { text: `mean ${capWithin.mean.toFixed(dp)}`, style: { fontSize: '9px', color: '#4A5B70' } }, zIndex: 3 },
        { value: capWithin.ucl, ...LIMIT_STYLE.control, label: { text: `UCL ${capWithin.ucl.toFixed(dp)}`, style: { fontSize: '9px', color: LIMIT_STYLE.control.color } }, zIndex: 3 },
        { value: capWithin.lcl, ...LIMIT_STYLE.control, label: { text: `LCL ${capWithin.lcl.toFixed(dp)}`, style: { fontSize: '9px', color: LIMIT_STYLE.control.color } }, zIndex: 3 },
        ...(usl !== undefined ? [{ value: usl, ...LIMIT_STYLE.spec, label: { text: `USL ${usl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 4 }] : []),
        ...(lsl !== undefined ? [{ value: lsl, ...LIMIT_STYLE.spec, label: { text: `LSL ${lsl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 4 }] : []),
        ...(target !== undefined ? [{ value: target, color: '#0F8A45', width: 1, dashStyle: 'ShortDot' as const, zIndex: 2 }] : []),
      ],
    },
    legend: { enabled: false },
    tooltip: {
      useHTML: true,
      formatter(this: Highcharts.Point) {
        const p = points[this.index ?? 0];
        if (!p) return false;
        const rules = p.rules.length ? `<br><span style="color:#F2B632">${p.rules.map((r) => RULE_TEXT[r]).join('<br>')}</span>` : '';
        return `<b>${p.v.toFixed(dp)} ${unitLabel(unit)}</b><br>${fmtTsMin(p.t)}<br><span style="opacity:.75">${p.label}</span>${rules}`;
      },
    },
    series: [
      {
        type: 'line',
        name: 'Value',
        color: '#1655F2',
        lineWidth: 1.25,
        marker: { enabled: points.length < 200, radius: 3 },
        data: points.map((p) => {
          // a point beyond 3 sigma is the alarm; pattern rules are weaker signals
          const severe = p.rules.includes(1);
          const pattern = p.rules.length > 0;
          return {
            x: p.t,
            y: p.v,
            marker: severe
              ? { enabled: true, radius: 5, fillColor: '#D92D20', lineColor: '#fff', lineWidth: 1, symbol: 'circle' }
              : pattern
                ? { enabled: true, radius: 3, fillColor: '#F2B632', lineWidth: 0, symbol: 'circle' }
                : undefined,
          };
        }),
      },
    ],
  }), [points, capWithin, unit, lsl, usl, target, dp]);

  const mr = useMemo(() => movingRange(points), [points]);
  const mrBar = mr.length ? mr.reduce((s, x) => s + x, 0) / mr.length : 0;

  const mrOptions: Highcharts.Options = useMemo(() => ({
    chart: { height: 130 },
    xAxis: { type: 'datetime', labels: { style: { fontSize: '9px' } } },
    yAxis: {
      title: { text: 'MR' }, min: 0,
      plotLines: [
        { value: mrBar, ...LIMIT_STYLE.target, zIndex: 3 },
        { value: mrBar * 3.267, ...LIMIT_STYLE.control, label: { text: 'UCL', style: { fontSize: '9px' } }, zIndex: 3 },
      ],
    },
    legend: { enabled: false },
    tooltip: { valueDecimals: dp + 1 },
    series: [{ type: 'line', name: 'Moving range', color: '#7A889A', lineWidth: 1, marker: { enabled: false }, data: points.slice(1).map((p, i) => [p.t, mr[i]]) }],
  }), [points, mr, mrBar, dp]);

  // histogram + fitted normal
  const hist = useMemo(() => {
    const min = Math.min(...raw, ...(lsl !== undefined ? [lsl] : []));
    const max = Math.max(...raw, ...(usl !== undefined ? [usl] : []));
    const pad = (max - min) * 0.08 || 1;
    const lo = min - pad, hi = max + pad;
    const bins = 24;
    const w = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    for (const v of raw) {
      const i = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)));
      counts[i] += 1;
    }
    const maxCount = Math.max(...counts, 1);
    const curve = normalCurve(capWithin.mean, capOverall?.sigmaOverall ?? capWithin.sigmaOverall, lo, hi);
    const maxPdf = Math.max(...curve.map((c) => c[1]), 1e-9);
    return {
      bars: counts.map((c, i) => [lo + w * (i + 0.5), c] as [number, number]),
      curve: curve.map(([x, y]) => [x, (y / maxPdf) * maxCount] as [number, number]),
      w, lo, hi,
    };
  }, [raw, capWithin, capOverall, lsl, usl]);

  const histOptions: Highcharts.Options = useMemo(() => ({
    chart: { height: 220 },
    xAxis: {
      title: { text: unitLabel(unit) },
      plotLines: [
        ...(usl !== undefined ? [{ value: usl, ...LIMIT_STYLE.spec, label: { text: `USL ${usl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 5 }] : []),
        ...(lsl !== undefined ? [{ value: lsl, ...LIMIT_STYLE.spec, label: { text: `LSL ${lsl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 5 }] : []),
        { value: capWithin.mean, ...LIMIT_STYLE.target, zIndex: 5 },
      ],
    },
    yAxis: { title: { text: 'Count' }, min: 0 },
    legend: { enabled: false },
    tooltip: { enabled: false },
    plotOptions: { column: { pointPadding: 0, groupPadding: 0.02, borderWidth: 0 } },
    series: [
      { type: 'column', name: 'Frequency', color: 'rgba(22,85,242,.45)', data: hist.bars, pointRange: hist.w },
      { type: 'spline', name: 'Normal fit', color: '#0C1927', lineWidth: 1.25, marker: { enabled: false }, data: hist.curve },
    ],
  }), [hist, unit, lsl, usl, capWithin]);

  const ad = useMemo(() => andersonDarling(raw), [raw]);
  const ci = cpkCI(capWithin.cpk, capWithin.n);
  const v = verdict(capWithin.cpk);
  const oneSided = lsl === undefined || usl === undefined;

  return (
    <div className="space-y-3">
      <ChartCard
        title={title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {subtitle}
            {obxLimit ? <ObxLimitTag /> : demoLimit ? <DemoLimitTag /> : null}
          </span>
        }
        info="Spec limits are dashed red; control limits (mean +/- 3 sigma within) are dotted blue. Red markers are Nelson rule violations."
        height={280}
        options={controlOptions}
      />

      <ChartCard title="Moving range" subtitle={`MR-bar ${mrBar.toFixed(dp + 1)}`} height={140} options={mrOptions} />

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Distribution" subtitle="Histogram with fitted normal curve and spec limits" height={230} options={histOptions} />

        <div className="card flex flex-col p-4">
          <h3 className="card-title mb-2">Capability</h3>

          <div className="grid grid-cols-2 gap-3">
            <CapStat label="Cp" value={oneSided ? null : capWithin.cp} hint="Spread only, within-subgroup sigma. N/A for a one-sided spec." />
            <CapStat label="Cpk" value={capWithin.cpk} hint={ci ? `95 % CI ${ci[0].toFixed(2)} - ${ci[1].toFixed(2)} (Bissell)` : undefined} emphasise />
            <CapStat label="Pp" value={oneSided ? null : capOverall?.pp ?? null} hint="Overall sigma (all variation, including between shifts)." />
            <CapStat label="Ppk" value={capOverall?.ppk ?? null} hint="Overall performance - what the customer actually sees." emphasise />
          </div>

          <div className={`mt-3 rounded-ctl px-3 py-2 text-xs ${v.tone === 'ok' ? 'bg-[rgba(30,158,90,.10)] text-ok' : v.tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-danger-bg text-danger'}`}>
            <b>{v.text}</b>
            {' '}&mdash; Cpk {fmtCpk(capWithin.cpk)}
            {capOverall && Math.abs(capWithin.cpk - (capOverall.ppk ?? 0)) > 0.25 && (
              <span> &middot; the gap to Ppk {fmtCpk(capOverall.ppk)} means the mean is shifting between subgroups (typically between shifts).</span>
            )}
          </div>

          <dl className="mt-3 space-y-1 text-xs">
            <Line label="n" value={String(capWithin.n)} />
            <Line label="Mean" value={`${capWithin.mean.toFixed(dp)} ${unitLabel(unit)}`} />
            <Line label="Sigma within" value={capWithin.sigmaWithin.toFixed(dp + 2)} />
            <Line label="Sigma overall" value={(capOverall?.sigmaOverall ?? capWithin.sigmaOverall).toFixed(dp + 2)} />
            <Line label="Spec" value={`${lsl ?? '-'} to ${usl ?? '-'} ${unitLabel(unit)}`} />
            {ad && <Line label="Normality (AD)" value={`A2 ${ad.a2.toFixed(2)}, p ${ad.p < 0.005 ? '< 0.005' : ad.p.toFixed(3)}`} />}
          </dl>

          {capWithin.indicative && (
            <p className="mt-2 rounded bg-subtle px-2 py-1 text-2xs text-txt-secondary">
              Indicative (n = {capWithin.n}). Capability on fewer than 30 values is statistically weak &mdash; treat as directional.
            </p>
          )}
          {ad && ad.p < 0.05 && (
            <p className="mt-1 text-2xs text-warn">Non-normal distribution &mdash; interpret capability with care.</p>
          )}
          {violations.length > 0 && (
            <p className="mt-2 text-2xs text-txt-secondary">
              Control-rule signals:{' '}
              {[...new Set(violations.flatMap((p) => p.rules))].sort().map((r) => (
                `${RULE_TEXT[r]} (${violations.filter((p) => p.rules.includes(r)).length})`
              )).join('; ')}
              . Red markers are beyond 3 sigma; amber markers are pattern rules.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CapStat({ label, value, hint, emphasise }: { label: string; value: number | null | undefined; hint?: string; emphasise?: boolean }) {
  const v = verdict(value);
  return (
    <div className="rounded-ctl border border-line px-3 py-2" title={hint}>
      <div className="lbl">{label}</div>
      <div
        className={`tnum ${emphasise ? 'text-xl' : 'text-base'} font-semibold`}
        style={{ color: value === null || value === undefined ? 'var(--text-muted)' : v.tone === 'ok' ? '#1E9E5A' : v.tone === 'warn' ? '#B7791F' : '#D92D20' }}
      >
        {fmtCpk(value)}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-line py-1 last:border-0">
      <dt className="text-txt-muted">{label}</dt>
      <dd className="mono text-txt-primary">{value}</dd>
    </div>
  );
}

export { Stat, num };
