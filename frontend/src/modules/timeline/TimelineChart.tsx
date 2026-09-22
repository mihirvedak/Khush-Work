import { useMemo } from 'react';
import type Highcharts from 'highcharts';
import { Chart } from '../../components/Chart';
import { decalPattern } from '../../theme/highcharts';
import { STATES, STATE_ORDER, stateMeta } from '../../lib/states';
import { fmtTs, fmtDuration, HOUR, shiftAt, startOfShift } from '../../lib/time';
import { withUnit } from '../../lib/format';
import { valueAt } from '../../data/index';
import { DS } from '../../store/useStore';
import type { UiEvent } from '../../lib/selectors';
import type { MachineState } from '../../data/types';

/** Parameters worth showing in the hover tooltip, per asset family (ref 02 "Hover tooltip"). */
export function snapshotTags(assetId: string): string[] {
  if (assetId.includes('WFE')) return ['VAC_PV', 'EVAP_PV', 'FEED_PV'];
  if (assetId.includes('ISO')) return ['T_INT', 'T_JKT'];
  if (assetId.includes('RXN')) return ['T_INT'];
  if (assetId.includes('CRY')) return ['PH', 'T_INT'];
  if (assetId.includes('EXT')) return ['LVL', 'TEMP'];
  if (assetId.includes('LLE')) return ['ORG_FLOW', 'AQ_FLOW'];
  if (assetId.includes('SRU')) return ['REB_TEMP'];
  return [];
}

const unitOf = (assetId: string, key: string) =>
  DS.tags.find((t) => t.assetId === assetId && t.key === key)?.unit ?? '';

export interface Lane {
  /** category label on the y axis */
  label: string;
  kind: 'state' | 'phase' | 'batch' | 'micro';
  assetId: string;
}

export interface TimelinePoint {
  x: number;
  x2: number;
  y: number;
  name?: string;
  ev?: UiEvent;
}

/**
 * UI-06 TimelineLanes. One series per machine state so the legend doubles as a
 * duration key; micro-stops get their own thin series (ref 02 #4).
 */
export function TimelineChart({
  events, lanes, from, to, height, onSelect, hideMicro, showPhaseBatch,
}: {
  events: UiEvent[];
  lanes: Lane[];
  from: number;
  to: number;
  height: number;
  onSelect: (e: UiEvent) => void;
  hideMicro: boolean;
  showPhaseBatch: boolean;
}) {
  const options = useMemo<Highcharts.Options>(() => {
    const laneIndex = new Map(lanes.map((l, i) => [`${l.assetId}|${l.kind}`, i]));

    // ---- state + micro series, grouped by state for the legend
    const byState = new Map<MachineState, TimelinePoint[]>();
    const totals = new Map<MachineState, number>();

    for (const e of events) {
      if (e.state === 'MICRO' && hideMicro) continue;
      const y = laneIndex.get(`${e.assetId}|${e.state === 'MICRO' ? 'micro' : 'state'}`)
        ?? laneIndex.get(`${e.assetId}|state`);
      if (y === undefined) continue;
      const x = Math.max(e.start, from);
      const x2 = Math.min(e.endOr, to);
      if (x2 <= x) continue;
      if (!byState.has(e.state)) byState.set(e.state, []);
      byState.get(e.state)!.push({ x, x2, y, ev: e });
      totals.set(e.state, (totals.get(e.state) ?? 0) + (x2 - x));
    }

    const stateSeries: Highcharts.SeriesXrangeOptions[] = STATE_ORDER
      .filter((s) => byState.has(s))
      .map((s) => {
        const m = STATES[s];
        const isMicro = s === 'MICRO';
        return {
          type: 'xrange',
          name: `${m.label} ${fmtDuration(totals.get(s) ?? 0)}`,
          id: s,
          colorByPoint: false,
          color: decalPattern(m.decal, m.fill) as Highcharts.ColorType,
          borderColor: s === 'NOSCH' ? '#AEB8C6' : 'rgba(255,255,255,.35)',
          borderWidth: s === 'NOSCH' ? 1 : 0.5,
          borderRadius: 2,
          pointWidth: isMicro ? 6 : showPhaseBatch ? 20 : 16,
          data: byState.get(s)!.map((p) => ({
            x: p.x, x2: p.x2, y: p.y,
            custom: { id: p.ev!.id },
          })),
          dataLabels: { enabled: false },
        } as Highcharts.SeriesXrangeOptions;
      });

    // ---- phase and batch lanes (single-asset view only)
    const extraSeries: Highcharts.SeriesXrangeOptions[] = [];
    if (showPhaseBatch) {
      const phaseY = laneIndex.get(`${lanes[0].assetId}|phase`);
      const batchY = laneIndex.get(`${lanes[0].assetId}|batch`);
      const assetId = lanes[0].assetId;

      if (phaseY !== undefined) {
        const pts: Highcharts.XrangePointOptionsObject[] = [];
        for (const b of DS.batches) {
          if (b.assetId !== assetId) continue;
          for (const p of b.phases) {
            const x = Math.max(p.start, from);
            const x2 = Math.min(p.end ?? to, to);
            if (x2 <= x) continue;
            pts.push({ x, x2, y: phaseY, name: p.name, custom: { phase: p.name, batch: b.id } });
          }
        }
        extraSeries.push({
          type: 'xrange', name: 'Phase', id: 'phase', showInLegend: false, colorByPoint: false,
          color: 'rgba(22,85,242,.10)', borderColor: '#B8CCFD', borderWidth: 1, borderRadius: 2,
          pointWidth: 16, data: pts,
          dataLabels: {
            enabled: true, inside: true, align: 'center',
            style: { fontSize: '10px', fontWeight: '600', color: '#0F43C4', textOutline: 'none' },
            formatter(this: Highcharts.Point) {
              const p = this as Highcharts.Point & { x2?: number; name?: string };
              const axis = this.series.xAxis;
              const widthPx = axis.toPixels(p.x2 ?? 0, true) - axis.toPixels(this.x as number, true);
              return widthPx < 40 ? '' : (p.name ?? '');
            },
          },
        } as Highcharts.SeriesXrangeOptions);
      }

      if (batchY !== undefined) {
        const pts: Highcharts.XrangePointOptionsObject[] = [];
        for (const b of DS.batches) {
          if (b.assetId !== assetId) continue;
          const x = Math.max(b.start, from);
          const x2 = Math.min(b.end ?? to, to);
          if (x2 <= x) continue;
          pts.push({ x, x2, y: batchY, name: b.id, custom: { batch: b.id } });
        }
        extraSeries.push({
          type: 'xrange', name: 'Batch', id: 'batch', showInLegend: false, colorByPoint: false,
          color: 'rgba(15,118,110,.10)', borderColor: '#0F766E66', borderWidth: 1, borderRadius: 2,
          pointWidth: 16, data: pts,
          dataLabels: {
            enabled: true, inside: true, align: 'center',
            style: { fontSize: '10px', fontWeight: '600', color: '#0F766E', textOutline: 'none' },
            formatter(this: Highcharts.Point) {
              const p = this as Highcharts.Point & { x2?: number; name?: string };
              const axis = this.series.xAxis;
              const widthPx = axis.toPixels(p.x2 ?? 0, true) - axis.toPixels(this.x as number, true);
              return widthPx < 70 ? '' : (p.name ?? '');
            },
          },
        } as Highcharts.SeriesXrangeOptions);
      }
    }

    // ---- shift bands (A plain, B tinted) so night shifts read at a glance
    const bands: Highcharts.XAxisPlotBandsOptions[] = [];
    let cur = startOfShift(from);
    while (cur < to) {
      const next = startOfShift(cur + 13 * HOUR);
      if (shiftAt(cur) === 'B') {
        bands.push({
          from: Math.max(cur, from), to: Math.min(next, to),
          color: 'rgba(122,136,154,.07)',
          label: { text: 'B', style: { color: '#7A889A', fontSize: '10px', fontWeight: '600' }, y: 12 },
        });
      }
      cur = next;
    }

    return {
      chart: { type: 'xrange', marginLeft: 132, zooming: { type: 'x' }, panning: { enabled: true, type: 'x' }, panKey: 'shift' },
      xAxis: {
        type: 'datetime', min: from, max: to, plotBands: bands,
        gridLineWidth: 1, gridLineColor: 'var(--chart-split)',
        crosshair: { width: 1, color: 'rgba(22,85,242,.35)' },
      },
      yAxis: {
        categories: lanes.map((l) => l.label),
        reversed: true,
        title: { text: undefined },
        gridLineWidth: 0,
        labels: {
          style: { fontSize: '11px', fontWeight: '600' },
          useHTML: true,
          formatter(this: { value: string | number; pos: number }) {
            const lane = lanes[this.pos];
            const muted = lane?.kind !== 'state';
            return `<span style="color:${muted ? 'var(--text-muted)' : 'var(--text-primary)'};font-weight:${muted ? 500 : 600}">${this.value}</span>`;
          },
        },
      },
      legend: { enabled: true, align: 'left', itemStyle: { fontSize: '11px' } },
      tooltip: {
        useHTML: true,
        formatter(this: Highcharts.Point) {
          const p = this as Highcharts.Point & { custom?: { id?: string; phase?: string; batch?: string }; x2?: number };
          if (p.custom?.id) {
            const ev = events.find((e) => e.id === p.custom!.id);
            if (!ev) return false;
            return eventTooltip(ev);
          }
          if (p.custom?.phase) {
            return `<b>${p.custom.phase}</b><br><span style="opacity:.75">${p.custom.batch ?? ''}</span><br>`
              + `${fmtTs(this.x as number)} &rarr; ${fmtTs(p.x2 as number)}`;
          }
          if (p.custom?.batch) {
            return `<b>${p.custom.batch}</b><br>${fmtTs(this.x as number)} &rarr; ${fmtTs(p.x2 as number)}`;
          }
          return false;
        },
      },
      plotOptions: {
        series: {
          cursor: 'pointer',
          point: {
            events: {
              click(this: Highcharts.Point) {
                const id = (this as Highcharts.Point & { custom?: { id?: string } }).custom?.id;
                const ev = events.find((e) => e.id === id);
                if (ev) onSelect(ev);
              },
            },
          },
        },
      },
      series: [...extraSeries, ...stateSeries],
      accessibility: {
        enabled: true,
        point: { descriptionFormatter: (p: Highcharts.Point) => `${p.series.name} on ${lanes[p.y as number]?.label}` },
      },
    };
  }, [events, lanes, from, to, hideMicro, showPhaseBatch, onSelect]);

  return <Chart options={options} height={height} />;
}

/** Rich hover card: state, times, duration, reason, batch, phase and a live parameter snapshot. */
function eventTooltip(ev: UiEvent): string {
  const m = stateMeta(ev.state);
  const snap = snapshotTags(ev.assetId)
    .map((k) => `${k} ${withUnit(valueAt(DS, ev.assetId, k, ev.start), unitOf(ev.assetId, k))}`)
    .join(' &middot; ');

  const reason = ev.reasonCode
    ? ev.reasonCode === 'U000'
      ? '<span style="color:#F2B632;font-weight:600">Untagged - tag now</span>'
      : `${ev.reasonCode} ${DS.reasons.find((r) => r.code === ev.reasonCode)?.label ?? ''}`
    : null;

  return [
    `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${m.fill}"></span> <b>${m.label}</b>`,
    `<span style="opacity:.8">${ev.assetId}</span>`,
    `${fmtTs(ev.start)} &rarr; ${ev.ongoing ? '<b style="color:#F2B632">Ongoing</b>' : fmtTs(ev.endOr)}`,
    `Duration <b>${fmtDuration(ev.durationMs)}</b>`,
    reason ? `Reason ${reason}` : '',
    ev.batchId ? `Batch <span style="font-family:monospace">${ev.batchId}</span>` : '',
    ev.phase ? `Phase ${ev.phase}` : '',
    snap ? `<span style="opacity:.75">${snap}</span>` : '',
    ev.backfilled ? '<span style="color:#A7B5C6">Back-filled from edge buffer</span>' : '',
    `<span style="opacity:.6">${ev.detectedBy}</span>`,
  ].filter(Boolean).join('<br>');
}
