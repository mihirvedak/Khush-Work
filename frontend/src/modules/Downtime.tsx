import { useMemo, useState } from 'react';
import type Highcharts from 'highcharts';
import { AlertTriangle } from 'lucide-react';
import { useStore, useRange, DS } from '../store/useStore';
import {
  selectEvents, downtimeMetrics, pareto, downtimeHeatmap, shiftStack, eventMsIn,
  type UiEvent, type EventQuery,
} from '../lib/selectors';
import { fmtTs, fmtDuration, fmtDurShort, shiftSpan, hours, MIN, HOUR } from '../lib/time';
import { dash, num } from '../lib/format';
import { categoryMeta, isUnplanned } from '../lib/states';
import { Card, CardHeader, Pill, StateChip, CategoryChip, Banner, IdLink } from '../components/primitives';
import { KpiTile, KpiStrip } from '../components/KpiTile';
import { ChartCard } from '../components/Chart';
import { DataTable, col } from '../components/DataTable';
import { EventDrawer } from './timeline/EventDrawer';

/** Escalation thresholds for constraint vs non-constraint assets (ref 06 matrix). */
function escalationLevel(e: UiEvent, now: number): 0 | 1 | 2 | 3 | 4 {
  if (!isUnplanned(e.state) || e.state === 'MICRO') return 0;
  const asset = DS.assets.find((a) => a.id === e.assetId);
  const mins = (Math.min(e.endOr, now) - e.start) / MIN;
  const constraint = asset?.isConstraint;
  if (constraint) {
    if (mins >= 480) return 4;
    if (mins >= 120) return 3;
    if (mins >= 30) return 2;
    return 1;
  }
  if (mins >= 240) return 3;
  if (mins >= 60) return 2;
  return 1;
}

/** RCA is required for long stops or repeats of the same reason within a shift (ref 03). */
function rcaRequired(e: UiEvent, all: UiEvent[]): boolean {
  if (e.durationMs >= 60 * MIN) return true;
  if (!e.reasonCode || e.reasonCode === 'U000') return false;
  const sameShift = all.filter(
    (x) => x.assetId === e.assetId && x.reasonCode === e.reasonCode && Math.abs(x.start - e.start) < 12 * HOUR,
  );
  return sameShift.length >= 3;
}

export function Downtime({ embedded }: { embedded?: boolean } = {}) {
  const { line, assetIds, shift, overlay, now } = useStore();
  const range = useRange();

  const [mode, setMode] = useState<'code' | 'mode'>('code');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<UiEvent | null>(null);

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );
  const query: EventQuery = { assetIds: assets.map((a) => a.id), from: range.from, to: range.to, shift };

  const events = useMemo(() => selectEvents(DS, query, overlay, now), [assets, range.from, range.to, shift, overlay, now]);
  const stops = useMemo(
    () => events.filter((e) => isUnplanned(e.state) && e.state !== 'MICRO'),
    [events],
  );

  const metrics = useMemo(() => downtimeMetrics(events, query), [events, query]);
  const rows = useMemo(() => {
    let r = stops;
    if (catFilter) r = r.filter((e) => (e.reasonCode ?? 'U000')[0] === catFilter);
    if (reasonFilter) r = r.filter((e) => (e.reasonCode ?? 'U000') === reasonFilter || (e.reasonCode ?? '').startsWith(reasonFilter));
    return [...r].reverse();
  }, [stops, catFilter, reasonFilter]);

  // ---------------------------------------------------------------- Pareto
  const paretoRows = useMemo(() => pareto(events, query, DS, mode, 12), [events, query, mode]);

  const paretoOptions: Highcharts.Options = useMemo(() => ({
    chart: { zooming: { type: 'x' } },
    xAxis: {
      categories: paretoRows.map((r) => r.key),
      labels: { rotation: 0, style: { fontSize: '10px' } },
      crosshair: true,
    },
    yAxis: [
      { title: { text: 'Downtime (h)' }, min: 0 },
      { title: { text: 'Cumulative %' }, min: 0, max: 100, opposite: true, labels: { format: '{value}%' } },
    ],
    tooltip: {
      shared: true,
      useHTML: true,
      formatter(this: Highcharts.Point) {
        const i = this.index ?? 0;
        const r = paretoRows[i];
        if (!r) return false;
        return `<b>${r.label}</b><br>Downtime <b>${fmtDuration(r.ms)}</b><br>`
          + `${r.count} stop${r.count === 1 ? '' : 's'} &middot; ${(r.pct * 100).toFixed(1)} % of total<br>`
          + `Cumulative ${(r.cumPct * 100).toFixed(1)} %`;
      },
    },
    legend: { enabled: false },
    plotOptions: {
      series: {
        cursor: 'pointer',
        point: {
          events: {
            click(this: Highcharts.Point) {
              const r = paretoRows[this.index ?? 0];
              if (r) setReasonFilter((cur) => (cur === r.key ? null : r.key));
            },
          },
        },
      },
    },
    series: [
      {
        type: 'column',
        name: 'Downtime',
        data: paretoRows.map((r) => ({ y: hours(r.ms), color: r.colour })),
        yAxis: 0,
      },
      {
        type: 'line',
        name: 'Cumulative',
        data: paretoRows.map((r) => r.cumPct * 100),
        yAxis: 1,
        color: '#0C1927',
        lineWidth: 1.5,
        marker: { enabled: true, radius: 3 },
      },
    ],
  }), [paretoRows]);

  // ---------------------------------------------------------------- category donut
  const byCategory = useMemo(() => {
    const acc = new Map<string, number>();
    for (const e of stops) {
      const c = (e.reasonCode ?? 'U000')[0];
      acc.set(c, (acc.get(c) ?? 0) + eventMsIn(e, query));
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  }, [stops, query]);

  const donutOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'pie' },
    tooltip: {
      formatter(this: Highcharts.Point) {
        return `<b>${this.name}</b><br>${fmtDuration((this.options as { custom?: { ms: number } }).custom?.ms ?? 0)} (${this.percentage?.toFixed(1)} %)`;
      },
    },
    plotOptions: {
      pie: {
        innerSize: '62%',
        dataLabels: { enabled: true, format: '{point.name}<br>{point.percentage:.0f} %', style: { fontSize: '10px', fontWeight: '500', textOutline: 'none' }, distance: 8 },
        cursor: 'pointer',
        point: {
          events: {
            click(this: Highcharts.Point) {
              const code = (this.options as { custom?: { code: string } }).custom?.code;
              setCatFilter((cur) => (cur === code ? null : code ?? null));
            },
          },
        },
      },
    },
    series: [{
      type: 'pie',
      name: 'Downtime',
      data: byCategory.map(([c, ms]) => ({
        name: categoryMeta(c).label,
        y: hours(ms),
        color: categoryMeta(c).colour,
        custom: { ms, code: c },
      })),
    }],
  }), [byCategory]);

  // ---------------------------------------------------------------- shift stack
  const stack = useMemo(() => shiftStack(events, query), [events, query]);
  const stackCats = useMemo(() => {
    const s = new Set<string>();
    stack.forEach(([, row]) => Object.keys(row).forEach((c) => s.add(c)));
    return [...s].sort();
  }, [stack]);

  const shiftOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'column' },
    xAxis: { categories: stack.flatMap(([d]) => [`${d.slice(5)} A`, `${d.slice(5)} B`]), labels: { style: { fontSize: '9px' } } },
    yAxis: { title: { text: 'Downtime (h)' }, min: 0, stackLabels: { enabled: false } },
    legend: { enabled: true },
    tooltip: { shared: true, valueSuffix: ' h', valueDecimals: 1 },
    plotOptions: { column: { stacking: 'normal', borderRadius: 2, pointPadding: 0.02, groupPadding: 0.08 } },
    series: stackCats.map((c) => ({
      type: 'column' as const,
      name: categoryMeta(c).label,
      color: categoryMeta(c).colour,
      data: stack.flatMap(([, row]) => [hours(row[c]?.A ?? 0), hours(row[c]?.B ?? 0)]),
    })),
  }), [stack, stackCats]);

  // ---------------------------------------------------------------- heatmap
  const heat = useMemo(
    () => downtimeHeatmap(events, query, assets.map((a) => a.id)),
    [events, query, assets],
  );

  const heatOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'heatmap', marginTop: 8, marginBottom: 56 },
    xAxis: { categories: heat.days.map((d) => d.slice(5)), labels: { style: { fontSize: '9px' } } },
    yAxis: { categories: heat.assets, title: { text: undefined }, reversed: true, labels: { style: { fontSize: '10px' } } },
    colorAxis: {
      min: 0,
      stops: [[0, '#F4F6FA'], [0.25, '#FDF3D8'], [0.6, '#F6C6C4'], [1, '#B42318']],
      labels: { format: '{value} min' },
    },
    legend: { align: 'right', layout: 'horizontal', verticalAlign: 'bottom', margin: 4, symbolHeight: 8 },
    tooltip: {
      formatter(this: Highcharts.Point) {
        const y = this.y as number;
        return `<b>${heat.assets[(this as unknown as { y: number }).y]}</b><br>${heat.days[this.x as number]}<br>`
          + `${fmtDurShort((this.value as number) * MIN)} down`.replace('undefined', String(y));
      },
    },
    series: [{
      type: 'heatmap',
      name: 'Downtime',
      borderWidth: 1,
      borderColor: 'var(--bg-surface)',
      data: heat.data,
      dataLabels: { enabled: false },
    }],
  }), [heat]);

  // ---------------------------------------------------------------- table
  const columns = useMemo(() => [
    col<UiEvent>('id', 'Event ID', (r) => <span className="mono">{r.id.replace(/^EV-/, 'DT-')}</span>, { sortFn: (r) => r.id, size: 140 }),
    col<UiEvent>('asset', 'Asset', (r) => <span className="mono">{r.assetId}</span>, { sortFn: (r) => r.assetId, size: 130 }),
    col<UiEvent>('start', 'Start (ET)', (r) => <span className="mono">{fmtTs(r.start)}</span>, { sortFn: (r) => r.start, size: 160 }),
    col<UiEvent>('end', 'End (ET)', (r) => (r.ongoing ? <StateChip state={r.state} size="sm" ongoing /> : <span className="mono">{fmtTs(r.endOr)}</span>), { sortFn: (r) => r.endOr, size: 160 }),
    col<UiEvent>('dur', 'Duration', (r) => <span className="mono font-semibold">{fmtDuration(r.durationMs)}</span>, { sortFn: (r) => r.durationMs, size: 100 }),
    col<UiEvent>('shift', 'Shift', (r) => shiftSpan(r.start, r.end, now), { size: 64 }),
    col<UiEvent>('batch', 'Batch', (r) => (r.batchId ? <IdLink id={r.batchId} /> : '-'), { size: 160 }),
    col<UiEvent>('phase', 'Phase at stop', (r) => dash(r.phase), { size: 120 }),
    col<UiEvent>('cat', 'Category', (r) => <CategoryChip category={(r.reasonCode ?? 'U000')[0]} />, { sortFn: (r) => (r.reasonCode ?? 'U000')[0], size: 170 }),
    col<UiEvent>('reason', 'Reason', (r) => {
      if (r.reasonCode === 'U000') {
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(r); }} className="rounded bg-warn-bg px-1.5 py-0.5 text-2xs font-semibold text-warn">
            Untagged - tag now
          </button>
        );
      }
      return <span>{r.reasonCode} {DS.reasons.find((x) => x.code === r.reasonCode)?.label}</span>;
    }, { sortFn: (r) => r.reasonCode ?? '', size: 250 }),
    col<UiEvent>('detected', 'Detected by', (r) => r.detectedBy, { size: 170 }),
    col<UiEvent>('taggedBy', 'Tagged by', (r) => dash(r.taggedBy), { size: 120 }),
    col<UiEvent>('status', 'Status', (r) => {
      if (r.ongoing) return <span className="rounded bg-danger-bg px-1.5 py-0.5 text-2xs font-semibold text-danger">Open</span>;
      if (r.reasonCode === 'U000') return <span className="rounded bg-warn-bg px-1.5 py-0.5 text-2xs font-semibold text-warn">Untagged</span>;
      if (rcaRequired(r, stops)) return <span className="rounded bg-[#FFEDD5] px-1.5 py-0.5 text-2xs font-semibold text-[#C2410C]">RCA required</span>;
      return <span className="rounded bg-subtle px-1.5 py-0.5 text-2xs font-semibold text-txt-secondary">Tagged</span>;
    }, { size: 130 }),
    col<UiEvent>('esc', 'Escalation', (r) => {
      const l = escalationLevel(r, now);
      return l ? <span className={l >= 3 ? 'font-semibold text-danger' : 'text-txt-secondary'}>L{l}</span> : '-';
    }, { size: 100 }),
    col<UiEvent>('remarks', 'Action / remarks', (r) => <span title={r.remarks}>{dash(r.remarks)}</span>, { size: 280 }),
  ], [now, stops]);

  const topFamily = useMemo(() => pareto(events, query, DS, 'mode', 1)[0], [events, query]);

  return (
    <div className="space-y-4">
      {!embedded && (
      <header>
        <h1 className="font-display text-title font-bold">Downtime Logger</h1>
        <p className="lbl mt-0.5">
          Detection is automatic, attribution is human, analysis is automatic. Every stop below was detected from machine state.
        </p>
      </header>
      )}

      {metrics.untaggedCount > 0 && (
        <Banner tone="warn" icon={<AlertTriangle size={16} />}>
          <b>{metrics.untaggedCount} untagged stop{metrics.untaggedCount === 1 ? '' : 's'}</b> ({fmtDurShort(metrics.untaggedMs)})
          {' '}in this window &mdash; {((metrics.untaggedMs / (metrics.downtimeMs || 1)) * 100).toFixed(1)} % of downtime minutes.
          Target is under 5 % at shift close. Click a row to tag it.
        </Banner>
      )}

      <KpiStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Unplanned downtime" value={fmtDurShort(metrics.downtimeMs)} tone="danger" />
        <KpiTile label="Events" value={metrics.stops} />
        <KpiTile label="MTTR" value={fmtDurShort(metrics.mttrMs)} hint="Total unplanned downtime / number of unplanned stops" />
        <KpiTile label="MTBF" value={fmtDurShort(metrics.mtbfMs)} hint="Total run time / number of unplanned stops" />
        <KpiTile label="Untagged" value={metrics.untaggedCount} unit={fmtDurShort(metrics.untaggedMs)} tone={metrics.untaggedCount ? 'warn' : 'default'} />
        <KpiTile
          label="Top failure mode"
          value={topFamily ? topFamily.key : '-'}
          unit={topFamily ? fmtDurShort(topFamily.ms) : undefined}
          hint={topFamily?.label}
        />
      </KpiStrip>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Downtime Pareto"
          subtitle={
            mode === 'mode'
              ? 'Grouped by failure mode - this is where the vacuum family (E1xx) shows its true size'
              : 'By individual reason code'
          }
          info="Click a bar to filter the table. Grouping by failure mode combines E101-E105 into one vacuum family."
          height={300}
          options={paretoOptions}
          right={
            <>
              <Pill active={mode === 'code'} onClick={() => setMode('code')}>By code</Pill>
              <Pill active={mode === 'mode'} onClick={() => setMode('mode')}>By failure mode</Pill>
            </>
          }
          tableView={{
            columns: ['Reason', 'Downtime (h)', 'Stops', '% of total', 'Cumulative %'],
            rows: paretoRows.map((r) => [r.label, hours(r.ms).toFixed(1), r.count, (r.pct * 100).toFixed(1), (r.cumPct * 100).toFixed(1)]),
          }}
          empty={paretoRows.length ? null : { title: 'No downtime in this window' }}
        />

        <ChartCard
          title="Downtime by category"
          subtitle="Click a slice to filter"
          height={300}
          options={donutOptions}
          tableView={{
            columns: ['Category', 'Hours'],
            rows: byCategory.map(([c, ms]) => [categoryMeta(c).label, hours(ms).toFixed(1)]),
          }}
          empty={byCategory.length ? null : { title: 'No downtime in this window' }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Shift-wise downtime"
          subtitle="A vs B per day, stacked by category"
          height={280}
          options={shiftOptions}
          empty={stack.length ? null : { title: 'No downtime in this window' }}
        />
        <ChartCard
          title="Asset x day heatmap"
          subtitle="Minutes down per asset per plant-day (ET)"
          height={Math.max(280, 80 + heat.assets.length * 16)}
          options={heatOptions}
          empty={heat.days.length ? null : { title: 'No downtime in this window' }}
        />
      </div>

      <Card>
        <CardHeader
          title="Downtime events"
          subtitle={
            (catFilter ? `Category ${categoryMeta(catFilter).label} · ` : '')
            + (reasonFilter ? `Reason ${reasonFilter} · ` : '')
            + `${rows.length} of ${stops.length} stops`
          }
          right={
            (catFilter || reasonFilter) && (
              <button
                type="button"
                onClick={() => { setCatFilter(null); setReasonFilter(null); }}
                className="rounded-ctl border border-line px-2 py-1 text-xs text-txt-secondary hover:bg-subtle"
              >
                Clear chart filter
              </button>
            )
          }
        />
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={setSelected}
          height={420}
          exportName="obx-downtime-events"
          searchPlaceholder="Search asset, reason, batch"
          emptyTitle="No downtime events match"
          emptyHint="Clear the chart filter or widen the date range."
          rowClassName={(r) => (r.ongoing ? 'bg-danger-bg/40' : r.reasonCode === 'U000' ? 'bg-warn-bg/40' : undefined)}
        />
      </Card>

      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export { num };
