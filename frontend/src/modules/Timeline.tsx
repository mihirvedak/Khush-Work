import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OctagonAlert, Tag } from 'lucide-react';
import { useStore, useRange, DS } from '../store/useStore';
import { selectEvents, downtimeMetrics, stateSplit, eventMsIn, type UiEvent, type EventQuery } from '../lib/selectors';
import { fmtTs, fmtDuration, fmtDurShort, shiftSpan, HOUR, DAY } from '../lib/time';
import { num, dash } from '../lib/format';
import { STATES } from '../lib/states';
import { Card, CardHeader, Pill, Toggle, StateChip, Banner, BackfilledBadge, IdLink } from '../components/primitives';
import { KpiTile, KpiStrip } from '../components/KpiTile';
import { DataTable, col } from '../components/DataTable';
import { TimelineChart, type Lane } from './timeline/TimelineChart';
import { EventDrawer } from './timeline/EventDrawer';

const ZOOMS = [
  { id: 'range', label: 'Full range', ms: 0 },
  { id: '8h', label: '8 h', ms: 8 * HOUR },
  { id: 'shift', label: 'Shift', ms: 12 * HOUR },
  { id: '24h', label: '24 h', ms: DAY },
  { id: '7d', label: '7 d', ms: 7 * DAY },
] as const;

export function Timeline() {
  const { line, assetIds, shift, overlay, now } = useStore();
  const range = useRange();
  const nav = useNavigate();

  const [zoom, setZoom] = useState<string>('range');
  const [groupBy, setGroupBy] = useState<'asset' | 'line'>('asset');
  const [hideMicro, setHideMicro] = useState(false);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [selected, setSelected] = useState<UiEvent | null>(null);

  // the zoom preset drives the chart window; the global range still drives the table
  // 'Full range' follows the global date picker; the other presets zoom inside it
  const zoomMs = ZOOMS.find((z) => z.id === zoom)?.ms ?? 0;
  const chartTo = Math.min(range.to, now);
  const chartFrom = zoomMs ? Math.max(range.from, chartTo - zoomMs) : range.from;

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );

  // keep the chart legible: 12 lane groups max, constraint assets first
  const chartAssets = useMemo(() => {
    const sorted = [...assets].sort((a, b) => Number(b.isConstraint) - Number(a.isConstraint));
    return sorted.slice(0, 12);
  }, [assets]);

  const singleAsset = chartAssets.length === 1;

  const query: EventQuery = { assetIds: assets.map((a) => a.id), from: range.from, to: range.to, shift };
  const events = useMemo(() => selectEvents(DS, query, overlay, now), [assets, range.from, range.to, shift, overlay, now]);

  const chartEvents = useMemo(
    () => selectEvents(DS, { assetIds: chartAssets.map((a) => a.id), from: chartFrom, to: chartTo, shift }, overlay, now),
    [chartAssets, chartFrom, chartTo, shift, overlay, now],
  );

  const metrics = useMemo(() => downtimeMetrics(events, query), [events, query]);
  const split = useMemo(() => stateSplit(events, query), [events, query]);
  const totalMs = Object.values(split).reduce((s, x) => s + x, 0) || 1;

  const lanes: Lane[] = useMemo(() => {
    if (singleAsset) {
      const id = chartAssets[0].id;
      return [
        { label: 'State', kind: 'state', assetId: id },
        { label: 'Micro-stops', kind: 'micro', assetId: id },
        { label: 'Phase', kind: 'phase', assetId: id },
        { label: 'Batch', kind: 'batch', assetId: id },
      ];
    }
    return chartAssets.map((a) => ({ label: a.id, kind: 'state' as const, assetId: a.id }));
  }, [chartAssets, singleAsset]);

  const tableRows = useMemo(
    () => (untaggedOnly ? events.filter((e) => e.reasonCode === 'U000') : events).slice().reverse(),
    [events, untaggedOnly],
  );

  const ongoingDown = events.find((e) => e.ongoing && e.state === 'DOWN');

  const columns = useMemo(() => [
    col<UiEvent>('sr', 'Sr No.', (_r) => '', { sortable: false, size: 56 }),
    col<UiEvent>('start', 'Event start (ET)', (r) => <span className="mono">{fmtTs(r.start)}</span>, { sortFn: (r) => r.start, size: 160 }),
    col<UiEvent>('end', 'Event end (ET)', (r) => (r.ongoing ? <StateChip state={r.state} size="sm" ongoing /> : <span className="mono">{fmtTs(r.endOr)}</span>), { sortFn: (r) => r.endOr, size: 160 }),
    col<UiEvent>('dur', 'Duration', (r) => <span className="mono">{fmtDuration(r.durationMs)}</span>, { sortFn: (r) => r.durationMs, size: 100 }),
    col<UiEvent>('shift', 'Shift', (r) => shiftSpan(r.start, r.end, now), { size: 64 }),
    col<UiEvent>('asset', 'Line / Asset', (r) => <span className="mono">{r.line} / {r.assetId}</span>, { sortFn: (r) => r.assetId, size: 160 }),
    col<UiEvent>('batch', 'Batch / Lot', (r) => (r.batchId ? <IdLink id={r.batchId} onClick={() => nav(`/genealogy?batch=${r.batchId}`)} /> : '-'), { sortFn: (r) => r.batchId ?? '', size: 170 }),
    col<UiEvent>('phase', 'Phase', (r) => dash(r.phase), { size: 110 }),
    col<UiEvent>('product', 'Product', (r) => dash(r.product), { size: 130 }),
    col<UiEvent>('status', 'Machine status', (r) => <StateChip state={r.state} size="sm" />, { sortFn: (r) => r.state, size: 150 }),
    col<UiEvent>('cat', 'Downtime category', (r) => (r.state === 'RUN' || !r.reasonCode ? '-' : DS.reasons.find((x) => x.code === r.reasonCode)?.group ?? '-'), { size: 160 }),
    col<UiEvent>('reason', 'Downtime reason', (r) => {
      if (r.state === 'RUN' || !r.reasonCode) return '-';
      if (r.reasonCode === 'U000') {
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(r); }} className="inline-flex items-center gap-1 rounded bg-warn-bg px-1.5 py-0.5 text-2xs font-semibold text-warn">
            <Tag size={10} /> Untagged - tag now
          </button>
        );
      }
      return <span>{r.reasonCode} {DS.reasons.find((x) => x.code === r.reasonCode)?.label}</span>;
    }, { sortFn: (r) => r.reasonCode ?? '', size: 240 }),
    col<UiEvent>('exp', 'Expected (kg)', (r) => num(r.expectedQty, 1), { sortFn: (r) => r.expectedQty ?? 0, size: 120 }),
    col<UiEvent>('act', 'Actual (kg)', (r) => num(r.actualQty, 1), { sortFn: (r) => r.actualQty ?? 0, size: 110 }),
    col<UiEvent>('var', 'Variance %', (r) => {
      if (!r.expectedQty || r.actualQty === null) return '-';
      const v = ((r.actualQty - r.expectedQty) / r.expectedQty) * 100;
      return <span style={{ color: v < -5 ? '#D92D20' : v > 5 ? '#B7791F' : undefined }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>;
    }, { size: 110 }),
    col<UiEvent>('detected', 'Detected by', (r) => r.detectedBy, { size: 170 }),
    col<UiEvent>('taggedBy', 'Tagged by', (r) => dash(r.taggedBy), { size: 120 }),
    col<UiEvent>('taggedAt', 'Tagged at (ET)', (r) => (r.taggedAt ? <span className="mono">{fmtTs(r.taggedAt)}</span> : '-'), { size: 160 }),
    col<UiEvent>('remarks', 'Remarks', (r) => <span title={r.remarks}>{dash(r.remarks)}</span>, { size: 260 }),
  ], [now, nav]);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-title font-bold">Machine Timeline</h1>
          <p className="lbl mt-0.5">
            Continuous state, phase and batch history &mdash; the record OBX cannot reconstruct from a 2-hour paper snapshot.
          </p>
        </div>
      </header>

      {ongoingDown && (
        <Banner
          tone="danger"
          icon={<OctagonAlert size={16} />}
          action={
            <button type="button" onClick={() => setSelected(ongoingDown)} className="rounded-ctl bg-danger px-3 py-1.5 text-xs font-semibold text-white">
              Open event
            </button>
          }
        >
          <b>{ongoingDown.assetId} down since {fmtTs(ongoingDown.start)} ET</b> &mdash; {' '}
          {ongoingDown.reasonCode && ongoingDown.reasonCode !== 'U000'
            ? `${ongoingDown.reasonCode} ${DS.reasons.find((r) => r.code === ongoingDown.reasonCode)?.label}`
            : 'untagged'}
          . Running {fmtDuration(now - ongoingDown.start)}.
          {ongoingDown.remarks && <span className="block text-xs text-txt-secondary">{ongoingDown.remarks}</span>}
        </Banner>
      )}

      <KpiStrip className="grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <KpiTile label="Running" value={fmtDurShort(split.RUN)} unit={`${((split.RUN / totalMs) * 100).toFixed(0)}%`} tone="ok" />
        <KpiTile label="Unplanned down" value={fmtDurShort(split.DOWN)} unit={`${((split.DOWN / totalMs) * 100).toFixed(0)}%`} tone="danger" />
        <KpiTile label="Planned" value={fmtDurShort(split.PLAN)} />
        <KpiTile label="Idle" value={fmtDurShort(split.IDLE)} />
        <KpiTile label="Stops" value={metrics.stops} hint="Unplanned stops, micro-stops excluded" />
        <KpiTile label="MTTR" value={fmtDurShort(metrics.mttrMs)} hint="Total unplanned downtime / number of unplanned stops" />
        <KpiTile
          label="Untagged"
          value={metrics.untaggedCount}
          unit={metrics.untaggedCount ? fmtDurShort(metrics.untaggedMs) : undefined}
          tone={metrics.untaggedCount ? 'warn' : 'default'}
          onClick={() => setUntaggedOnly(true)}
          hint="Auto-detected stops with no reason. Target < 5 % of downtime minutes at shift close."
        />
      </KpiStrip>

      <Card>
        <CardHeader
          title={singleAsset ? `${chartAssets[0].id} - ${chartAssets[0].name}` : `${chartAssets.length} assets`}
          subtitle={`${fmtTs(chartFrom)} - ${fmtTs(chartTo)} ET${assets.length > chartAssets.length ? ` (showing first ${chartAssets.length} of ${assets.length})` : ''}`}
          right={
            <>
              <div className="inline-flex overflow-hidden rounded-ctl border border-line">
                {ZOOMS.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZoom(z.id)}
                    aria-pressed={zoom === z.id}
                    className={zoom === z.id ? 'bg-azure-600 px-2.5 py-1 text-xs font-medium text-white' : 'bg-surface px-2.5 py-1 text-xs text-txt-secondary hover:bg-subtle'}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <Pill active={groupBy === 'asset'} onClick={() => setGroupBy('asset')}>By asset</Pill>
              <Toggle checked={hideMicro} onChange={setHideMicro} label="Hide micro-stops" />
            </>
          }
        />
        <div className="px-2 pb-3 pt-2">
          <TimelineChart
            events={chartEvents}
            lanes={lanes}
            from={chartFrom}
            to={chartTo}
            height={singleAsset ? 230 : Math.max(220, 46 + chartAssets.length * 30)}
            onSelect={setSelected}
            hideMicro={hideMicro}
            showPhaseBatch={singleAsset}
          />
          <p className="px-3 pt-1 text-2xs text-txt-muted">
            Drag across the chart to zoom, shift-drag to pan. Click any segment to open the event and tag a reason.
            Patterns carry state as well as colour.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Event details"
          subtitle={`${range.label} \u00b7 ${shift === 'ALL' ? 'both shifts' : `shift ${shift}`}`}
          right={<Toggle checked={untaggedOnly} onChange={setUntaggedOnly} label="Untagged only" />}
        />
        <DataTable
          data={tableRows}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={setSelected}
          height={420}
          exportName="obx-timeline-events"
          searchPlaceholder="Search asset, batch, reason"
          emptyTitle="No events in this window"
          emptyHint="Widen the date range or clear the asset filter."
          rowClassName={(r) => (r.ongoing ? 'bg-danger-bg/40' : r.reasonCode === 'U000' ? 'bg-warn-bg/40' : undefined)}
        />
      </Card>

      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export { STATES };
export { BackfilledBadge };
export { eventMsIn };
