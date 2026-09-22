import { useMemo, useState } from 'react';
import type Highcharts from 'highcharts';
import { Info } from 'lucide-react';
import { useStore, useRange, DS } from '../store/useStore';
import { computeOee } from '../data/index';
import { selectEvents, selectBatches, pareto, selectQualityLosses, type EventQuery } from '../lib/selectors';
import { fmtTs, fmtDurShort, dayKey, hours as hoursOf, DAY, startOfEtDay } from '../lib/time';
import { num, pct, pctRaw } from '../lib/format';
import { stateMeta } from '../lib/states';
import { Card, CardHeader, StateChip, IdLink } from '../components/primitives';
import { Stat } from '../components/KpiTile';
import { ChartCard } from '../components/Chart';
import { DataTable, col } from '../components/DataTable';
import type { Asset, Batch, ShiftId } from '../data/types';
import type { Overlay } from '../store/useStore';

type Oee = ReturnType<typeof computeOee>;

const OEE_TARGET = 0.6;

/** Colour by batch-chemical benchmark (45-65 %), never "world class 85 %". */
function oeeTone(v: number): 'ok' | 'warn' | 'danger' {
  if (v >= 0.6) return 'ok';
  if (v >= 0.45) return 'warn';
  return 'danger';
}

export function Oee() {
  const { line, assetIds, shift, now, overlay } = useStore();
  const range = useRange();
  const [drill, setDrill] = useState<string | null>(null);

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );

  const shiftArg = shift === 'ALL' ? undefined : (shift as ShiftId);
  const oeeOf = (ids: string[], sh?: ShiftId) =>
    computeOee(DS, { assetIds: ids, from: range.from, to: range.to, shift: sh });

  // Line OEE = constraint asset (hard rule 2 / ref 04)
  const constraintsL1 = DS.assets.filter((a) => a.line === 'L1' && a.isConstraint).map((a) => a.id);
  const constraintsL2 = DS.assets.filter((a) => a.line === 'L2' && a.isConstraint).map((a) => a.id);

  const l1 = useMemo(() => oeeOf(constraintsL1, shiftArg), [range.from, range.to, shift]);
  const l2 = useMemo(() => oeeOf(constraintsL2, shiftArg), [range.from, range.to, shift]);

  // Plant OEE = PPT-weighted average of the two line OEEs
  const plant = useMemo(() => {
    const w1 = l1.hours.ppt, w2 = l2.hours.ppt;
    const tot = w1 + w2 || 1;
    return {
      oee: (l1.oee * w1 + l2.oee * w2) / tot,
      availability: (l1.availability * w1 + l2.availability * w2) / tot,
      performance: (l1.performance * w1 + l2.performance * w2) / tot,
      quality: (l1.quality * w1 + l2.quality * w2) / tot,
    };
  }, [l1, l2]);

  const perAsset = useMemo(
    () => assets.map((a) => ({ asset: a, oee: oeeOf([a.id], shiftArg) })),
    [assets, range.from, range.to, shift],
  );

  // asset-average OEE (run-time weighted) as the secondary number
  const assetAvg = useMemo(() => {
    const tot = perAsset.reduce((s, x) => s + x.oee.hours.run, 0) || 1;
    return perAsset.reduce((s, x) => s + x.oee.oee * x.oee.hours.run, 0) / tot;
  }, [perAsset]);

  const scopeIds = assets.map((a) => a.id);
  const scopeOee = useMemo(() => oeeOf(scopeIds, shiftArg), [assets, range.from, range.to, shift]);

  // ------------------------------------------------------------- waterfall
  const waterfall: Highcharts.Options = useMemo(() => {
    const h = scopeOee.hours;
    const available = h.ppt - h.planned;
    const perfLoss = h.run * (1 - scopeOee.performance);
    const qualLoss = h.run * scopeOee.performance * (1 - scopeOee.quality);
    const effective = h.run - perfLoss - qualLoss;
    return {
      chart: { type: 'waterfall' },
      xAxis: { categories: ['Planned production', 'Planned stops', 'Availability loss', 'Performance loss', 'Quality loss', 'Effective time'], labels: { style: { fontSize: '10px' } } },
      yAxis: { title: { text: 'Hours' } },
      legend: { enabled: false },
      tooltip: { valueSuffix: ' h', valueDecimals: 1 },
      series: [{
        type: 'waterfall',
        name: 'Hours',
        upColor: '#1E9E5A',
        color: '#E5484D',
        data: [
          { name: 'Planned production', y: h.ppt, color: '#4A5B70' },
          { name: 'Planned stops', y: -h.planned, color: '#6E56CF' },
          { name: 'Availability loss', y: -(available - h.run), color: '#E5484D' },
          { name: 'Performance loss', y: -perfLoss, color: '#EA7A1A' },
          { name: 'Quality loss', y: -qualLoss, color: '#B7791F' },
          { name: 'Effective time', isSum: true, color: '#1E9E5A' },
        ],
        dataLabels: { enabled: true, format: '{y:.1f}', style: { fontSize: '10px', textOutline: 'none' } },
        pointPadding: 0.05,
      } as Highcharts.SeriesWaterfallOptions],
      annotations: [{
        labels: [],
        draggable: '' as const,
      }],
      subtitle: { text: `Effective ${effective.toFixed(1)} h of ${h.ppt.toFixed(1)} h planned`, align: 'left', style: { fontSize: '10px', color: '#7A889A' } },
    };
  }, [scopeOee]);

  // ------------------------------------------------------------- shift comparison
  const shiftCompare: Highcharts.Options = useMemo(() => {
    const a = oeeOf(scopeIds, 'A');
    const b = oeeOf(scopeIds, 'B');
    return {
      chart: { type: 'column' },
      xAxis: { categories: ['Availability', 'Performance', 'Quality', 'OEE'] },
      yAxis: { title: { text: '%' }, min: 0, max: 100 },
      tooltip: { shared: true, valueSuffix: ' %', valueDecimals: 1 },
      series: [
        { type: 'column', name: 'Shift A', color: '#1655F2', data: [a.availability * 100, a.performance * 100, a.quality * 100, a.oee * 100] },
        { type: 'column', name: 'Shift B', color: '#6E56CF', data: [b.availability * 100, b.performance * 100, b.quality * 100, b.oee * 100] },
      ],
    };
  }, [assets, range.from, range.to]);

  // ------------------------------------------------------------- OEE trend by day
  const trend = useMemo(() => {
    const out: { day: string; oee: number }[] = [];
    let d = startOfEtDay(range.from);
    while (d < range.to) {
      const next = d + DAY;
      const r = computeOee(DS, { assetIds: scopeIds, from: d, to: Math.min(next, range.to), shift: shiftArg });
      if (r.hours.ppt > 0) out.push({ day: dayKey(d), oee: r.oee * 100 });
      d = next;
    }
    return out;
  }, [assets, range.from, range.to, shift]);

  const trendOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'line' },
    xAxis: { categories: trend.map((t) => t.day.slice(5)), labels: { style: { fontSize: '9px' } } },
    yAxis: {
      title: { text: 'OEE %' }, min: 0, max: 100,
      plotLines: [{ value: OEE_TARGET * 100, color: '#7A889A', width: 1, dashStyle: 'Dash', label: { text: `target ${OEE_TARGET * 100} %`, style: { fontSize: '9px', color: '#7A889A' } }, zIndex: 3 }],
      plotBands: [{ from: 45, to: 65, color: 'rgba(30,158,90,.06)', label: { text: 'batch-chemical benchmark 45-65 %', style: { fontSize: '9px', color: '#7A889A' }, align: 'right', x: -6 } }],
    },
    legend: { enabled: false },
    tooltip: { valueSuffix: ' %', valueDecimals: 1 },
    series: [{ type: 'line', name: 'OEE', data: trend.map((t) => t.oee), color: '#1655F2', marker: { enabled: trend.length < 40, radius: 3 } }],
  }), [trend]);

  // ------------------------------------------------------------- paretos
  const scopeQuery: EventQuery = { assetIds: scopeIds, from: range.from, to: range.to, shift };
  const scopeEvents = useMemo(
    () => selectEvents(DS, scopeQuery, overlay, now),
    [assets, range.from, range.to, shift, overlay, now],
  );

  const dtRows = useMemo(() => pareto(scopeEvents, scopeQuery, DS, 'code', 10), [scopeEvents, range.from, range.to, shift]);

  const downtimePareto: Highcharts.Options = useMemo(() => ({
    chart: { type: 'column' },
    xAxis: { categories: dtRows.map((r) => r.key), labels: { style: { fontSize: '10px' } }, crosshair: true },
    yAxis: [
      { title: { text: 'Downtime (h)' }, min: 0 },
      { title: { text: 'Cumulative %' }, min: 0, max: 100, opposite: true, labels: { format: '{value}%' } },
    ],
    legend: { enabled: false },
    tooltip: {
      shared: true,
      formatter(this: Highcharts.Point) {
        const r = dtRows[this.index ?? 0];
        if (!r) return false;
        return `<b>${r.label}</b><br>${hoursOf(r.ms).toFixed(1)} h across ${r.count} stops<br>`
          + `${(r.pct * 100).toFixed(1)} % of downtime \u00b7 cumulative ${(r.cumPct * 100).toFixed(1)} %`;
      },
    },
    series: [
      { type: 'column', name: 'Downtime', yAxis: 0, data: dtRows.map((r) => ({ y: hoursOf(r.ms), color: r.colour })) },
      { type: 'line', name: 'Cumulative', yAxis: 1, color: '#0C1927', lineWidth: 1.5, marker: { enabled: true, radius: 3 }, data: dtRows.map((r) => r.cumPct * 100) },
    ],
  }), [dtRows]);

  const qlRows = useMemo(() => {
    const losses = selectQualityLosses(DS, { assetIds: scopeIds, from: range.from, to: range.to, shift }, overlay);
    const acc = new Map<string, { kg: number; label: string; n: number }>();
    for (const l of losses) {
      const cur = acc.get(l.reasonCode) ?? { kg: 0, label: l.reasonLabel, n: 0 };
      acc.set(l.reasonCode, { kg: cur.kg + l.qtyKg, label: l.reasonLabel, n: cur.n + 1 });
    }
    return [...acc.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 10);
  }, [assets, range.from, range.to, shift, overlay]);

  const rejectionPareto: Highcharts.Options = useMemo(() => {
    const total = qlRows.reduce((s, r) => s + r.kg, 0) || 1;
    let cum = 0;
    const cumulative = qlRows.map((r) => { cum += r.kg; return (cum / total) * 100; });
    return {
      chart: { type: 'column' },
      xAxis: { categories: qlRows.map((r) => r.code), labels: { style: { fontSize: '10px' } }, crosshair: true },
      yAxis: [
        { title: { text: 'Quality loss (kg)' }, min: 0 },
        { title: { text: 'Cumulative %' }, min: 0, max: 100, opposite: true, labels: { format: '{value}%' } },
      ],
      legend: { enabled: false },
      tooltip: {
        shared: true,
        formatter(this: Highcharts.Point) {
          const r = qlRows[this.index ?? 0];
          if (!r) return false;
          return `<b>${r.code}</b><br>${r.label}<br><b>${r.kg.toFixed(1)} kg</b> across ${r.n} record(s)`;
        },
      },
      series: [
        { type: 'column', name: 'kg', yAxis: 0, data: qlRows.map((r) => ({ y: r.kg, color: r.code.startsWith('QL1') ? '#0F766E' : '#1655F2' })) },
        { type: 'line', name: 'Cumulative', yAxis: 1, color: '#0C1927', lineWidth: 1.5, marker: { enabled: true, radius: 3 }, data: cumulative },
      ],
    };
  }, [qlRows]);

  // ------------------------------------------------------------- drill
  const drillAsset = drill ? DS.assets.find((a) => a.id === drill) : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-title font-bold">OEE</h1>
        <p className="lbl mt-0.5">
          Batch-aware: performance uses ideal <em>batch cycle time</em>, not parts per minute.
          Yield is shown beside OEE, never folded into Quality.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="px-4 py-3">
          <div className="lbl">Plant OEE</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-kpi font-semibold tnum">{pct(plant.oee)}</span>
            <span className="text-xs text-txt-muted">vs target {pct(OEE_TARGET, 0)}</span>
          </div>
          <div className="mt-2 flex gap-4">
            <Stat label="A" value={pct(plant.availability)} />
            <Stat label="P" value={pct(plant.performance)} />
            <Stat label="Q" value={pct(plant.quality)} />
          </div>
          <p className="mt-2 text-2xs text-txt-muted">
            PPT-weighted average of both line OEEs. Asset-average (run-time weighted) {pct(assetAvg)}.
          </p>
        </Card>

        <LineCard title="L1 Kratom / MIT" oee={l1} constraint="CRY-01 + CRY-02" extra={<KratomExtras />} />
        <LineCard title="L2 Bulk Cannabinoids" oee={l2} constraint="WFE-2M" extra={<BulkExtras from={range.from} to={range.to} />} />
      </div>

      <Card>
        <CardHeader
          title="Assets"
          subtitle={`${perAsset.length} assets · ${range.label}${shift === 'ALL' ? '' : ` · shift ${shift}`}`}
          info="OEE = A x P x Q, recomputed from events - never stored as an independent number."
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {perAsset.map(({ asset, oee }) => (
            <AssetTile key={asset.id} asset={asset} oee={oee} now={now} onClick={() => setDrill(asset.id)} selected={drill === asset.id} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Loss waterfall"
          subtitle={`${scopeIds.length} asset${scopeIds.length === 1 ? '' : 's'} · hours`}
          info="Segments sum to planned production time. Availability loss = unplanned down + idle + hold + micro."
          height={300}
          options={waterfall}
          tableView={{
            columns: ['Bucket', 'Hours'],
            rows: [
              ['Planned production time', scopeOee.hours.ppt.toFixed(1)],
              ['Planned stops', scopeOee.hours.planned.toFixed(1)],
              ['Unplanned (availability loss)', scopeOee.hours.unplanned.toFixed(1)],
              ['Run time', scopeOee.hours.run.toFixed(1)],
            ],
          }}
        />
        <ChartCard
          title="Shift comparison"
          subtitle="A vs B across A, P, Q and OEE"
          info="Shift B on WFE-2M runs about 8 points below A - the vacuum pump oil check is missed on the B daily checklist."
          height={300}
          options={shiftCompare}
        />
      </div>

      <ChartCard
        title="OEE trend"
        subtitle={`Daily OEE · ${trend.length} day${trend.length === 1 ? '' : 's'}`}
        height={260}
        options={trendOptions}
        empty={trend.length > 1 ? null : { title: 'Select a wider date range', hint: 'The trend needs at least two plant-days.' }}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Downtime Pareto"
          subtitle="Availability loss by reason - the biggest lever on OEE"
          info="Availability is usually the dominant OEE loss on a batch chemical plant. Same Pareto as the Downtime Logger, scoped to the assets selected above."
          height={300}
          options={downtimePareto}
          tableView={{
            columns: ['Reason', 'Hours', 'Stops', '% of downtime'],
            rows: dtRows.map((r) => [r.label, hoursOf(r.ms).toFixed(1), r.count, (r.pct * 100).toFixed(1)]),
          }}
          empty={dtRows.length ? null : { title: 'No downtime in this window' }}
        />
        <ChartCard
          title="Rejection Pareto"
          subtitle="Quality loss by reason (kg) - drives the Q in OEE"
          info="Quality loss is mass-based: first-pass good mass over total mass. Rework also consumes reactor time, so it reappears as availability loss."
          height={300}
          options={rejectionPareto}
          tableView={{
            columns: ['Reason', 'kg', 'Records'],
            rows: qlRows.map((r) => [`${r.code} ${r.label}`, r.kg.toFixed(1), r.n]),
          }}
          empty={qlRows.length ? null : { title: 'No quality losses in this window' }}
        />
      </div>

      {drillAsset && <AssetDrill asset={drillAsset} from={range.from} to={range.to} shift={shiftArg} onClose={() => setDrill(null)} overlay={overlay} now={now} />}
    </div>
  );
}

function LineCard({ title, oee, constraint, extra }: { title: string; oee: Oee; constraint: string; extra?: React.ReactNode }) {
  return (
    <Card className="px-4 py-3">
      <div className="lbl">{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-kpi font-semibold tnum" style={{ color: oeeTone(oee.oee) === 'ok' ? '#1E9E5A' : oeeTone(oee.oee) === 'warn' ? '#B7791F' : '#D92D20' }}>
          {pct(oee.oee)}
        </span>
        <span className="text-2xs text-txt-muted">constraint: {constraint}</span>
      </div>
      <div className="mt-2 flex gap-4">
        <Stat label="A" value={pct(oee.availability)} />
        <Stat label="P" value={pct(oee.performance)} />
        <Stat label="Q" value={pct(oee.quality)} />
      </div>
      {extra}
    </Card>
  );
}

/** L1's own question: heptane loss per kg MIT (ref 01 section 2.4). */
function KratomExtras() {
  const lossLperKg = 8.9; // demo actual; range 6.8 - 11.5, target <= 6.0
  return (
    <p className="mt-2 text-2xs text-txt-muted">
      Yield MIT 68.4 % &middot; Heptane <b className="text-warn">{lossLperKg} L/kg MIT</b> vs target 6.0
    </p>
  );
}

function BulkExtras({ from, to }: { from: number; to: number }) {
  const kg = useMemo(() => {
    return DS.batches
      .filter((b) => b.assetId === 'L2-WFE-2M' && b.end !== null && b.end >= from && b.end <= to)
      .reduce((s, b) => s + (b.outputKg ?? 0), 0);
  }, [from, to]);
  return (
    <p className="mt-2 text-2xs text-txt-muted">
      Yield CBD 71.2 % &middot; Distillate <b>{num(kg, 0)} kg</b>
    </p>
  );
}

function AssetTile({ asset, oee, now, onClick, selected }: { asset: Asset; oee: Oee; now: number; onClick: () => void; selected: boolean }) {
  const live = DS.events.filter((e) => e.assetId === asset.id && e.start <= now && (e.end ?? Infinity) > now).pop();
  const tone = oeeTone(oee.oee);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card px-3 py-2.5 text-left transition-colors ${selected ? 'border-azure-600 bg-azure-50/50' : 'hover:border-azure-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mono text-xs font-semibold text-txt-primary">{asset.id}</div>
          <div className="truncate text-2xs text-txt-muted">{asset.name}</div>
        </div>
        {asset.isConstraint && (
          <span className="shrink-0 rounded bg-azure-50 px-1 text-[9px] font-bold text-azure-700">CONSTRAINT</span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold tnum" style={{ color: tone === 'ok' ? '#1E9E5A' : tone === 'warn' ? '#B7791F' : '#D92D20' }}>
          {pct(oee.oee)}
        </span>
        {live && <StateChip state={live.state} size="sm" ongoing={live.end === null && live.state !== 'RUN'} />}
      </div>

      <div className="mt-2 space-y-1">
        {([['A', oee.availability], ['P', oee.performance], ['Q', oee.quality]] as const).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="w-3 text-2xs text-txt-muted">{k}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, v * 100)}%`, background: k === 'A' ? '#1655F2' : k === 'P' ? '#EA7A1A' : '#0F8A45' }} />
            </span>
            <span className="w-9 text-right text-2xs tnum text-txt-secondary">{pctRaw(v * 100, 0)}</span>
          </div>
        ))}
      </div>

      {live?.reasonCode && live.reasonCode !== 'U000' && live.state !== 'RUN' && (
        <p className="mt-2 truncate text-2xs text-danger">
          {live.reasonCode} {DS.reasons.find((r) => r.code === live.reasonCode)?.label}
        </p>
      )}
    </button>
  );
}

/** 4.2 Asset drill: rate chart, top losses, batch table, batch phase Gantt. */
function AssetDrill({
  asset, from, to, shift, onClose, overlay, now,
}: { asset: Asset; from: number; to: number; shift?: ShiftId; onClose: () => void; overlay: Overlay; now: number }) {
  const oee = computeOee(DS, { assetIds: [asset.id], from, to, shift });
  const q: EventQuery = { assetIds: [asset.id], from, to, shift: shift ?? 'ALL' };
  const events = selectEvents(DS, q, overlay, now);
  const top = pareto(events, q, DS, 'code', 5);
  const batches = selectBatches(DS, { assetIds: [asset.id], from, to }).filter((b) => b.end !== null);

  // rate chart (continuous assets) - actual vs rated, the gap IS the performance loss
  const rateOptions: Highcharts.Options | null = asset.kind === 'continuous' && asset.ratedRate
    ? {
        chart: { type: 'area' },
        xAxis: { type: 'datetime' },
        yAxis: {
          title: { text: asset.rateUnit ?? 'kg/h' },
          plotLines: [{ value: asset.ratedRate, color: '#D92D20', width: 1.5, dashStyle: 'Dash', label: { text: `rated ${asset.ratedRate} ${asset.rateUnit}`, style: { fontSize: '9px', color: '#D92D20' } }, zIndex: 4 }],
        },
        legend: { enabled: false },
        tooltip: { xDateFormat: '%Y-%m-%d %H:%M', valueDecimals: 2, valueSuffix: ` ${asset.rateUnit}` },
        series: [{
          type: 'area',
          name: 'Actual feed',
          color: '#1655F2',
          fillColor: { linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 }, stops: [[0, 'rgba(22,85,242,.20)'], [1, 'rgba(22,85,242,0)']] },
          data: events
            .filter((e) => e.state === 'RUN' && e.actualQty !== null)
            .map((e) => [e.start, (e.actualQty as number) / Math.max(0.01, (e.endOr - e.start) / 3_600_000)]),
        }],
      }
    : null;

  const phaseGantt: Highcharts.Options | null = batches.length && asset.kind !== 'continuous'
    ? (() => {
        const b = batches[0];
        return {
          chart: { type: 'xrange' },
          xAxis: { type: 'datetime' },
          yAxis: { categories: b.phases.map((p) => p.name), reversed: true, title: { text: undefined } },
          legend: { enabled: true },
          tooltip: {
            formatter(this: Highcharts.Point) {
              const p = this as Highcharts.Point & { x2?: number; custom?: { ideal?: number; actual?: number } };
              const c = p.custom ?? {};
              return `<b>${b.phases[this.y as number].name}</b><br>`
                + `Actual ${(c.actual ?? 0).toFixed(1)} h &middot; ideal ${(c.ideal ?? 0).toFixed(1)} h`;
            },
          },
          series: [
            {
              type: 'xrange', name: 'Ideal', colorByPoint: false, color: 'rgba(122,136,154,.25)', pointWidth: 8, borderWidth: 0,
              data: b.phases.map((p, i) => ({ x: p.start, x2: p.start + p.idealH * 3_600_000, y: i })),
            } as Highcharts.SeriesXrangeOptions,
            {
              type: 'xrange', name: 'Actual', colorByPoint: false, pointWidth: 16, borderWidth: 0,
              data: b.phases.map((p, i) => {
                const actual = ((p.end ?? now) - p.start) / 3_600_000;
                const over = actual > p.idealH * 1.15;
                return {
                  x: p.start, x2: p.end ?? now, y: i,
                  color: over ? '#E5484D' : '#1E9E5A',
                  custom: { ideal: p.idealH, actual },
                };
              }),
            } as Highcharts.SeriesXrangeOptions,
          ],
        };
      })()
    : null;

  const batchCols = useMemo(() => [
    col<Batch>('id', 'Batch', (r) => <IdLink id={r.id} />, { sortFn: (r) => r.id, size: 180 }),
    col<Batch>('start', 'Start (ET)', (r) => <span className="mono">{fmtTs(r.start)}</span>, { sortFn: (r) => r.start, size: 160 }),
    col<Batch>('end', 'End (ET)', (r) => <span className="mono">{r.end ? fmtTs(r.end) : 'Ongoing'}</span>, { sortFn: (r) => r.end ?? 0, size: 160 }),
    col<Batch>('ideal', 'Ideal cycle (h)', (r) => num(r.idealCycleH, 1), { size: 120 }),
    col<Batch>('actual', 'Actual cycle (h)', (r) => num(((r.end ?? now) - r.start) / 3_600_000, 1), { size: 130 }),
    col<Batch>('eff', 'Cycle efficiency', (r) => {
      const actual = ((r.end ?? now) - r.start) / 3_600_000;
      const e = actual ? (r.idealCycleH / actual) * 100 : 0;
      return <span style={{ color: e < 70 ? '#D92D20' : e < 90 ? '#B7791F' : '#1E9E5A' }}>{e.toFixed(0)}%</span>;
    }, { size: 130 }),
    col<Batch>('out', 'Output (kg)', (r) => num(r.outputKg, 1), { sortFn: (r) => r.outputKg ?? 0, size: 110 }),
    col<Batch>('yield', 'Yield %', (r) => (r.theoreticalKg ? pctRaw(((r.outputKg ?? 0) / r.theoreticalKg) * 100) : '-'), { size: 100 }),
    col<Batch>('fp', 'First pass', (r) => (r.firstPass === null ? '-' : r.firstPass ? 'Yes' : 'No'), { size: 100 }),
  ], [now]);

  return (
    <Card>
      <CardHeader
        title={`${asset.id} - ${asset.name}`}
        subtitle={`${asset.stage} · ${asset.area} · record ${asset.record}`}
        right={
          <>
            <Stat label="OEE" value={pct(oee.oee)} />
            <Stat label="A" value={pct(oee.availability)} />
            <Stat label="P" value={pct(oee.performance)} />
            <Stat label="Q" value={pct(oee.quality)} />
            <button type="button" onClick={onClose} className="rounded-ctl border border-line px-2 py-1 text-xs text-txt-secondary hover:bg-subtle">
              Close
            </button>
          </>
        }
      />

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-txt-muted">Top downtime reasons</h3>
          {top.length ? (
            <ul className="space-y-1">
              {top.map((r) => (
                <li key={r.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.colour }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="mono text-txt-secondary">{fmtDurShort(r.ms)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-txt-muted">No unplanned downtime in this window.</p>
          )}

          <h3 className="mb-2 mt-4 text-2xs font-semibold uppercase tracking-wide text-txt-muted">Time split</h3>
          <div className="space-y-1">
            {([['Run', oee.hours.run, 'RUN'], ['Unplanned', oee.hours.unplanned, 'DOWN'], ['Planned', oee.hours.planned, 'PLAN']] as const).map(([label, h, st]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-txt-secondary">{label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full" style={{ width: `${(h / (oee.hours.ppt || 1)) * 100}%`, background: stateMeta(st).fill }} />
                </span>
                <span className="mono w-14 text-right text-txt-secondary">{h.toFixed(1)} h</span>
              </div>
            ))}
          </div>
        </div>

        {rateOptions && (
          <ChartCard
            title="Throughput vs rated rate"
            subtitle="The gap between actual and the rated line is the performance loss"
            height={240}
            options={rateOptions}
          />
        )}
        {!rateOptions && phaseGantt && (
          <ChartCard
            title="Batch phases - ideal vs actual"
            subtitle={batches[0] ? `${batches[0].id} · ghost bar is ideal duration` : ''}
            height={240}
            options={phaseGantt}
          />
        )}
      </div>

      <DataTable
        data={batches}
        columns={batchCols}
        getRowId={(r) => r.id}
        height={260}
        exportName={`obx-batches-${asset.id}`}
        searchPlaceholder="Search batch"
        emptyTitle="No completed batches in this window"
      />
    </Card>
  );
}

export { Info };
