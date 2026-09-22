import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as HighchartsReactModule from 'highcharts-react-official';
import type HighchartsReactDefault from 'highcharts-react-official';
import Highcharts from '../theme/highcharts';
import clsx from 'clsx';
import { Table2, Maximize2, Download, X } from 'lucide-react';
import { Card, CardHeader, EmptyState } from './primitives';

export { Highcharts };

/**
 * highcharts-react-official ships CommonJS, so Vite's dep optimizer can wrap the
 * component one or two levels deep (`default`, or `default.default`, or the named
 * export). Walk down until we find something React will accept as a component.
 */
function resolveComponent(mod: unknown): unknown {
  let cur = mod;
  for (let i = 0; i < 4; i++) {
    if (typeof cur === 'function') return cur;
    if (cur && typeof cur === 'object' && '$$typeof' in (cur as Record<string, unknown>)) return cur;
    const rec = cur as Record<string, unknown> | null | undefined;
    if (!rec) break;
    cur = rec.default ?? rec.HighchartsReact;
  }
  return cur;
}

const HighchartsReact = resolveComponent(HighchartsReactModule) as typeof HighchartsReactDefault;

/** Thin Highcharts wrapper: fixed height, resize-aware, reduced-motion aware. */
export function Chart({
  options, height = 260, className, constructorType,
}: {
  options: Highcharts.Options;
  height?: number;
  className?: string;
  constructorType?: 'chart' | 'stockChart' | 'ganttChart';
}) {
  const ref = useRef<HighchartsReactDefault.RefObject>(null);

  // Highcharts does not observe container resize on its own.
  useEffect(() => {
    const el = ref.current?.container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => ref.current?.chart?.reflow());
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, []);

  const merged: Highcharts.Options = {
    ...options,
    chart: { height, ...(options.chart ?? {}) },
  };

  return (
    <div className={className}>
      <HighchartsReact
        ref={ref}
        highcharts={Highcharts}
        constructorType={constructorType}
        options={merged}
        containerProps={{ style: { width: '100%' } }}
      />
    </div>
  );
}

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * UI-13 ChartCard: title, subtitle carrying window + n, toolbar, and a
 * "View as table" toggle - every chart must have one (design theme section 8).
 */
export function ChartCard({
  title, subtitle, info, height = 260, options, tableView, right, empty, className, constructorType, children,
}: {
  title: string;
  subtitle?: ReactNode;
  info?: string;
  height?: number;
  options?: Highcharts.Options;
  tableView?: TableView;
  right?: ReactNode;
  /** when set, the card shows this message instead of a chart */
  empty?: { title: string; hint?: string } | null;
  className?: string;
  constructorType?: 'chart' | 'stockChart' | 'ganttChart';
  children?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const [full, setFull] = useState(false);

  const body = empty ? (
    <EmptyState title={empty.title} hint={empty.hint} />
  ) : asTable && tableView ? (
    <div className="max-h-[320px] overflow-auto px-4 pb-3">
      <table className="w-full text-xs tnum">
        <thead className="sticky top-0 bg-subtle">
          <tr>
            {tableView.columns.map((c) => (
              <th key={c} className="border-b border-line px-2 py-1.5 text-left font-semibold text-txt-secondary">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableView.rows.map((r, i) => (
            <tr key={i} className={i % 2 ? 'bg-subtle/40' : ''}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-line px-2 py-1">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : children ? (
    <div className="px-2 pb-2">{children}</div>
  ) : options ? (
    <Chart options={options} constructorType={constructorType} height={full ? Math.round(window.innerHeight * 0.72) : height} className="px-2 pb-2" />
  ) : null;

  const card = (
    <Card className={clsx('flex flex-col', className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        info={info}
        right={
          <>
            {right}
            {tableView && (
              <button
                type="button"
                onClick={() => setAsTable((v) => !v)}
                aria-pressed={asTable}
                title={asTable ? 'View as chart' : 'View as table'}
                className="rounded p-1 text-txt-muted hover:bg-subtle hover:text-txt-secondary"
              >
                <Table2 size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              title={full ? 'Exit full screen' : 'Full screen'}
              className="rounded p-1 text-txt-muted hover:bg-subtle hover:text-txt-secondary"
            >
              {full ? <X size={14} /> : <Maximize2 size={14} />}
            </button>
          </>
        }
      />
      <div className="min-h-0 flex-1">{body}</div>
    </Card>
  );

  if (!full) return card;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas p-6" role="dialog" aria-modal>
      {card}
    </div>
  );
}

/** Download the current chart as PNG (offline-exporting, no server round-trip). */
export function downloadChart(chart: Highcharts.Chart | undefined, filename: string) {
  (chart as unknown as { exportChartLocal?: (a: unknown, b: unknown) => void })?.exportChartLocal?.({ type: 'image/png', filename }, {});
}

export { Download };
