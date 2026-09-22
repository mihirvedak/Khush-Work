import { useEffect, useMemo, useState } from 'react';
import type Highcharts from 'highcharts';
import { DS, useStore } from '../../store/useStore';
import { getSeries } from '../../data/index';
import { ChartCard } from '../../components/Chart';
import { DemoLimitTag } from '../../components/primitives';
import { unitLabel, valueDp } from '../../lib/format';
import { FACLON_COLORS, LIMIT_STYLE } from '../../theme/highcharts';
import { selectEvents } from '../../lib/selectors';
import { stateMeta } from '../../lib/states';
import { HOUR, DAY } from '../../lib/time';

/** Keep every series under ~5,000 points: pick the step from the window (ref 07). */
function stepFor(ms: number): number {
  if (ms <= 6 * HOUR) return 10;
  if (ms <= DAY) return 60;
  if (ms <= 7 * DAY) return 300;
  return 900;
}

export function TrendsTab({ assetId, from, to }: { assetId: string; from: number; to: number }) {
  const { overlay, now } = useStore();
  const tags = useMemo(() => DS.tags.filter((t) => t.assetId === assetId && t.sampleSec <= 60), [assetId]);

  const [picked, setPicked] = useState<string[]>(() => tags.slice(0, 3).map((t) => t.key));
  const [showEvents, setShowEvents] = useState(true);

  // a tag list from a previous asset would resolve to undefined and blank the chart
  useEffect(() => {
    const valid = picked.filter((k) => tags.some((t) => t.key === k));
    if (valid.length !== picked.length || valid.length === 0) {
      setPicked(valid.length ? valid : tags.slice(0, 3).map((t) => t.key));
    }
  }, [assetId, tags]);

  const step = stepFor(to - from);

  const series = useMemo(
    () => picked.map((key, i) => {
      const tag = DS.tags.find((t) => t.assetId === assetId && t.key === key)!;
      const s = getSeries(DS, assetId, key, from, to, step);
      return { tag, colour: FACLON_COLORS[i % FACLON_COLORS.length], data: s.t.map((t, j) => [t, s.v[j]] as [number, number]) };
    }),
    [picked, assetId, from, to, step],
  );

  // downtime / phase markers as vertical bands
  const events = useMemo(
    () => selectEvents(DS, { assetIds: [assetId], from, to }, overlay, now).filter((e) => e.state !== 'RUN' && e.state !== 'NOSCH'),
    [assetId, from, to, overlay, now],
  );

  const options: Highcharts.Options = useMemo(() => ({
    chart: { zooming: { type: 'x' }, marginRight: 60 },
    xAxis: {
      type: 'datetime',
      crosshair: true,
      plotBands: showEvents
        ? events.slice(0, 200).map((e) => ({
            from: e.start,
            to: e.endOr,
            color: `${stateMeta(e.state).fill}22`,
            label: undefined,
          }))
        : [],
    },
    // one y-axis per parameter, stacked - avoids the dual-axis lie
    yAxis: series.map((s, i) => ({
      title: { text: `${s.tag.label} (${unitLabel(s.tag.unit)})`, style: { fontSize: '10px', color: s.colour } },
      labels: { style: { fontSize: '10px', color: s.colour }, format: `{value:.${valueDp(s.tag.unit)}f}` },
      height: `${100 / series.length - 4}%`,
      top: `${(100 / series.length) * i}%`,
      offset: 0,
      lineWidth: 0,
      plotLines: [
        ...(s.tag.usl !== undefined ? [{ value: s.tag.usl, ...LIMIT_STYLE.spec, label: { text: `USL ${s.tag.usl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 3 }] : []),
        ...(s.tag.lsl !== undefined ? [{ value: s.tag.lsl, ...LIMIT_STYLE.spec, label: { text: `LSL ${s.tag.lsl}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 3 }] : []),
        ...(s.tag.target !== undefined ? [{ value: s.tag.target, ...LIMIT_STYLE.target, zIndex: 2 }] : []),
      ],
    })),
    legend: { enabled: true },
    tooltip: {
      shared: true,
      xDateFormat: '%Y-%m-%d %H:%M:%S',
      formatter(this: Highcharts.Point) {
        const pts = (this as unknown as { points?: Highcharts.Point[] }).points ?? [this];
        return pts.map((p) => {
          const s = series.find((x) => x.tag.label === p.series.name);
          return `<span style="color:${p.color}">&#9632;</span> ${p.series.name}: <b>${(p.y ?? 0).toFixed(valueDp(s?.tag.unit ?? ''))} ${unitLabel(s?.tag.unit ?? '')}</b>`;
        }).join('<br>');
      },
    },
    plotOptions: { line: { marker: { enabled: false }, lineWidth: 1.25 } },
    series: series.map((s, i) => ({
      type: 'line' as const,
      name: s.tag.label,
      color: s.colour,
      yAxis: i,
      data: s.data,
      boostThreshold: 2000,
    })),
  }), [series, events, showEvents]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="lbl mr-1">Parameters (max 6)</span>
        {tags.map((t) => {
          const on = picked.includes(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setPicked((cur) => (on ? cur.filter((k) => k !== t.key) : cur.length >= 6 ? cur : [...cur, t.key]))}
              aria-pressed={on}
              className={
                on
                  ? 'rounded-full border border-azure-600 bg-azure-50 px-2.5 py-1 text-2xs font-semibold text-azure-700'
                  : 'rounded-full border border-line px-2.5 py-1 text-2xs text-txt-secondary hover:bg-subtle'
              }
              title={`${t.label} (${unitLabel(t.unit)})`}
            >
              {t.key}
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-1.5 text-2xs text-txt-secondary">
          <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
          Shade downtime / stops
        </label>
      </div>

      <ChartCard
        title="Parameter trends"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            {series.length} parameter{series.length === 1 ? '' : 's'} &middot; {step}s resolution &middot; spec limits dashed red
            <DemoLimitTag />
          </span>
        }
        height={Math.max(300, series.length * 140)}
        options={options}
        empty={series.length ? null : { title: 'Pick at least one parameter' }}
      />
    </div>
  );
}
