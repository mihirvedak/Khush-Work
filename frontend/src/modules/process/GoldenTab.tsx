import { useEffect, useMemo, useState } from 'react';
import type Highcharts from 'highcharts';
import { DS, useStore } from '../../store/useStore';
import { goldenTunnel, getSeries } from '../../data/index';
import { ChartCard } from '../../components/Chart';
import { EmptyState, DemoLimitTag } from '../../components/primitives';
import { unitLabel, valueDp, num } from '../../lib/format';
import { LIMIT_STYLE, FACLON_COLORS } from '../../theme/highcharts';
import type { Batch } from '../../data/types';

/** Golden-tunnel variables per asset family (ref 05). */
const GT_TAGS: Record<string, string[]> = {
  ISO: ['T_INT', 'T_JKT'],
  RXN: ['T_INT'],
  CRY: ['PH', 'T_INT', 'DOSE_RATE'],
  SLT: ['T_INT'],
};

function familyOf(assetId: string): string {
  for (const k of ['ISO', 'RXN', 'CRY', 'SLT', 'WFE']) if (assetId.includes(k)) return k;
  return '';
}

export function GoldenTab({ assetId }: { assetId: string }) {
  const fam = familyOf(assetId);
  // WFE is continuous, so it gets an operating window instead of a phase-aligned tunnel.
  // The split has to happen in a wrapper: returning early from a component that still has
  // hooks below would change the hook count between assets and blank the screen.
  return fam === 'WFE' ? <GoldenWindow assetId={assetId} /> : <GoldenTunnelView assetId={assetId} fam={fam} />;
}

function GoldenTunnelView({ assetId, fam }: { assetId: string; fam: string }) {
  const { now } = useStore();
  const tagKeys = GT_TAGS[fam] ?? [];
  const [tagKey, setTagKey] = useState(tagKeys[0] ?? 'T_INT');

  // the selected variable must follow the asset family when the user switches asset
  useEffect(() => {
    if (!tagKeys.includes(tagKey)) setTagKey(tagKeys[0] ?? 'T_INT');
  }, [assetId, fam]);

  // ISO/RXN pool across the reactor family; CRY stays per-crystallizer
  const prefix = fam === 'CRY' ? assetId : assetId.slice(0, assetId.lastIndexOf('-'));
  const tunnel = useMemo(() => goldenTunnel(DS, prefix, tagKey, 60), [prefix, tagKey]);

  // the batch currently running on this asset, overlaid on the tunnel
  const liveBatch = useMemo(
    () => DS.batches.filter((b) => b.assetId === assetId && b.start <= now && (b.end ?? Infinity) > now).pop()
      ?? DS.batches.filter((b) => b.assetId === assetId && b.end !== null).sort((a, b) => (b.end ?? 0) - (a.end ?? 0))[0],
    [assetId, now],
  );

  const tag = DS.tags.find((t) => t.assetId === assetId && t.key === tagKey);
  const unit = tag?.unit ?? 'degC';
  const dp = valueDp(unit);

  const options: Highcharts.Options | null = useMemo(() => {
    if (tunnel.status !== 'ok' || !tunnel.band) return null;

    // flatten phases onto a single normalised x axis, with a boundary per phase
    const phasePoints = tunnel.band;
    const perPhase = phasePoints[0]?.pts.length ?? 60;
    const boundaries: { at: number; name: string }[] = [];
    const median: [number, number][] = [];
    const band: [number, number, number][] = [];

    phasePoints.forEach((ph, pi) => {
      boundaries.push({ at: pi * perPhase, name: ph.phase });
      ph.pts.forEach((p, i) => {
        const x = pi * perPhase + i;
        median.push([x, p.median]);
        band.push([x, p.lo, p.hi]);
      });
    });

    // live batch resampled onto the same phase-aligned axis
    const live: [number, number][] = [];
    if (liveBatch) {
      phasePoints.forEach((ph, pi) => {
        const bp = liveBatch.phases.find((x) => x.name === ph.phase);
        if (!bp) return;
        const end = bp.end ?? now;
        if (end <= bp.start) return;
        const s = getSeries(DS, liveBatch.assetId, tagKey, bp.start, end, Math.max(10, Math.round((end - bp.start) / 1000 / perPhase)));
        for (let i = 0; i < perPhase && i < s.v.length; i++) live.push([pi * perPhase + i, s.v[i]]);
      });
    }

    return {
      chart: { zooming: { type: 'x' } },
      xAxis: {
        title: { text: 'Phase-aligned time' },
        labels: { enabled: false },
        plotLines: boundaries.map((b) => ({
          value: b.at,
          color: 'var(--border)',
          width: 1,
          label: { text: b.name, rotation: 0, style: { fontSize: '9px', color: '#7A889A' }, y: 12, x: 3 },
          zIndex: 2,
        })),
        max: phasePoints.length * perPhase,
      },
      yAxis: {
        title: { text: `${tag?.label ?? tagKey} (${unitLabel(unit)})` },
        plotLines: [
          ...(tag?.usl !== undefined ? [{ value: tag.usl, ...LIMIT_STYLE.spec, label: { text: `USL ${tag.usl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 4 }] : []),
          ...(tag?.lsl !== undefined ? [{ value: tag.lsl, ...LIMIT_STYLE.spec, label: { text: `LSL ${tag.lsl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 4 }] : []),
        ],
      },
      legend: { enabled: true },
      tooltip: {
        shared: true,
        formatter(this: Highcharts.Point) {
          const pts = (this as unknown as { points?: Highcharts.Point[] }).points ?? [this];
          return pts.map((p) => `<span style="color:${p.color}">&#9632;</span> ${p.series.name}: <b>${(p.y ?? 0).toFixed(dp)} ${unitLabel(unit)}</b>`).join('<br>');
        },
      },
      series: [
        {
          type: 'arearange',
          name: `Golden tunnel (P5-P95, n=${tunnel.n})`,
          data: band,
          color: 'rgba(0,234,95,.18)',
          lineWidth: 0,
          fillOpacity: 1,
          marker: { enabled: false },
          zIndex: 0,
        } as Highcharts.SeriesArearangeOptions,
        {
          type: 'line',
          name: 'Golden median',
          data: median,
          color: '#0F8A45',
          lineWidth: 1.5,
          dashStyle: 'ShortDash',
          marker: { enabled: false },
          zIndex: 1,
        },
        ...(live.length
          ? [{
              type: 'line' as const,
              name: `Current batch ${liveBatch?.id ?? ''}`,
              data: live,
              color: FACLON_COLORS[0],
              lineWidth: 2,
              marker: { enabled: false },
              zIndex: 2,
            }]
          : []),
      ],
    };
  }, [tunnel, liveBatch, tagKey, tag, unit, dp, now]);

  if (tunnel.status !== 'ok') {
    return (
      <EmptyState
        title="Insufficient history"
        hint={`Only ${tunnel.n} qualifying first-pass batch${tunnel.n === 1 ? '' : 'es'} - the tunnel needs at least 8.`}
      />
    );
  }

  const goldenIds = 'batchIds' in tunnel ? tunnel.batchIds : [];

  return (
    <div className="space-y-3">
      {tagKeys.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="lbl mr-1">Variable</span>
          {tagKeys.map((k) => {
            const t = DS.tags.find((x) => x.assetId === assetId && x.key === k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTagKey(k)}
                aria-pressed={tagKey === k}
                className={
                  tagKey === k
                    ? 'rounded-full border border-azure-600 bg-azure-50 px-2.5 py-1 text-2xs font-semibold text-azure-700'
                    : 'rounded-full border border-line px-2.5 py-1 text-2xs text-txt-secondary hover:bg-subtle'
                }
              >
                {t?.label ?? k}
              </button>
            );
          })}
        </div>
      )}

      <ChartCard
        title="Golden tunnel"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Built from the top-quartile batches by yield, aligned on phase-relative time
            <DemoLimitTag />
          </span>
        }
        info="A time-based band would be wrong when batches run at different speeds, so each phase is normalised to 0-1 and resampled. The band is P5-P95 of the golden set."
        height={360}
        options={options ?? undefined}
        empty={options ? null : { title: 'No tunnel could be built' }}
      />

      <div className="card p-4">
        <h3 className="card-title mb-1">Contributing batches</h3>
        <p className="lbl mb-2">
          {tunnel.n} batches, ranked by yield percentile. Only completed, first-pass-released batches qualify.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {goldenIds.slice(0, 24).map((id) => (
            <span key={id} className="mono rounded border border-line px-1.5 py-0.5 text-2xs text-txt-secondary">{id}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * WFE is continuous, so the "tunnel" is an operating window rather than a profile.
 * The generator stores only yieldPct per campaign, so the operating conditions are
 * computed here as means over each campaign's STEADY FEED phase - never invented.
 */
function GoldenWindow({ assetId }: { assetId: string }) {
  const WINDOW_TAGS = ['FEED_PV', 'FEED_T', 'EVAP_PV', 'COND_PV', 'VAC_PV', 'WIPER_PV'] as const;

  const rows = useMemo(() => {
    const out: { id: string; yieldPct: number; vals: Record<string, number> }[] = [];
    for (const b of DS.batches) {
      if (b.assetId !== assetId || b.end === null) continue;
      const steady = b.phases.find((p) => p.name === 'STEADY FEED');
      if (!steady || steady.end === null) continue;
      const span = steady.end - steady.start;
      if (span < 30 * 60 * 1000) continue;
      const step = Math.max(60, Math.round(span / 1000 / 80));
      const vals: Record<string, number> = {};
      for (const k of WINDOW_TAGS) {
        const s = getSeries(DS, assetId, k, steady.start, steady.end, step);
        const live = s.v.filter((v) => Number.isFinite(v) && v !== 0);
        vals[k] = live.length ? live.reduce((a, c) => a + c, 0) / live.length : NaN;
      }
      if (Number.isFinite(vals.EVAP_PV) && Number.isFinite(vals.VAC_PV)) {
        out.push({ id: b.id, yieldPct: b.metrics?.yieldPct ?? 0, vals });
      }
    }
    return out;
  }, [assetId]);

  const yields = rows.map((r) => r.yieldPct).filter((y) => y > 0);
  const yMin = yields.length ? Math.min(...yields) : 0;
  const yMax = yields.length ? Math.max(...yields) : 100;
  const p75 = yields.length ? [...yields].sort((a, b) => a - b)[Math.floor(yields.length * 0.75)] : 0;

  const scatter: Highcharts.Options = useMemo(() => ({
    chart: { type: 'scatter', zooming: { type: 'xy' } },
    xAxis: { title: { text: 'Evaporator temperature (°C)' }, gridLineWidth: 1 },
    yAxis: { title: { text: 'Vacuum (mbar)' } },
    legend: { enabled: false },
    colorAxis: {
      min: yMin, max: yMax,
      stops: [[0, '#D92D20'], [0.5, '#F2B632'], [1, '#1E9E5A']],
      labels: { format: '{value:.0f} %' },
    },
    tooltip: {
      formatter(this: Highcharts.Point) {
        const r = rows[this.index ?? 0];
        if (!r) return false;
        return `<b>${r.id}</b><br>Evaporator ${(this.x as number).toFixed(1)} °C<br>`
          + `Vacuum ${(this.y as number).toFixed(3)} mbar<br>`
          + `Feed ${num(r.vals.FEED_PV, 2)} kg/h<br>Yield <b>${num(r.yieldPct, 1)} %</b>`;
      },
    },
    series: [{
      type: 'scatter',
      name: 'Campaign',
      data: rows.map((r) => ({
        x: r.vals.EVAP_PV,
        y: r.vals.VAC_PV,
        colorValue: r.yieldPct,
        marker: { radius: r.yieldPct >= p75 ? 7 : 5, lineWidth: r.yieldPct >= p75 ? 1.5 : 0, lineColor: '#0F8A45' },
      })),
    }],
  }), [rows, yMin, yMax, p75]);

  const parallel: Highcharts.Options = useMemo(() => ({
    chart: { parallelCoordinates: true, parallelAxes: { lineWidth: 1, labels: { style: { fontSize: '9px' } } }, type: 'spline' },
    xAxis: {
      categories: ['Feed rate\n(kg/h)', 'Feed temp\n(°C)', 'Evaporator\n(°C)', 'Condenser\n(°C)', 'Vacuum\n(mbar)', 'Wiper\n(rpm)', 'Yield\n(%)'],
      offset: 10,
      labels: { style: { fontSize: '9px' } },
    },
    yAxis: WINDOW_TAGS.map(() => ({})).concat([{}]),
    legend: { enabled: false },
    plotOptions: { series: { animation: false, lineWidth: 1, states: { hover: { lineWidth: 2.5 } }, marker: { enabled: false } } },
    tooltip: {
      formatter(this: Highcharts.Point) {
        return `<b>${this.series.name}</b><br>${this.y}`;
      },
    },
    series: rows.slice(0, 60).map((r) => ({
      type: 'spline' as const,
      name: r.id,
      color: r.yieldPct >= p75 ? 'rgba(15,138,69,.8)' : r.yieldPct <= yMin + (yMax - yMin) * 0.25 ? 'rgba(217,45,32,.6)' : 'rgba(122,136,154,.3)',
      data: [...WINDOW_TAGS.map((k) => Number(r.vals[k].toFixed(3))), Number(r.yieldPct.toFixed(1))],
    })),
  }), [rows, p75, yMin, yMax]);

  if (rows.length < 4) {
    return (
      <EmptyState
        title="Not enough completed campaigns"
        hint={`${rows.length} campaign(s) with a STEADY FEED phase - the operating window needs several to be meaningful.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <ChartCard
        title="Golden operating window"
        subtitle={`Evaporator temperature vs vacuum, coloured by campaign yield \u00b7 n = ${rows.length}`}
        info="Each point is one campaign, positioned by its mean operating conditions during STEADY FEED and coloured by the yield it achieved. Ringed points are the top quartile."
        height={340}
        options={scatter}
      />
      <ChartCard
        title="Operating conditions vs yield"
        subtitle="Parallel coordinates - green lines are the top-quartile campaigns, red the bottom quartile"
        height={320}
        options={parallel}
      />
      <p className="text-2xs text-txt-muted">
        This is the shape of the answer to OBX&rsquo;s question &mdash; which WFE operating conditions travel with yield.
        On synthetic data the correlation is illustrative; the same view built on OBX&rsquo;s own history is what makes
        it actionable, and any relationship would need validating before it drove a setpoint.
      </p>
    </div>
  );
}

export type { Batch };
