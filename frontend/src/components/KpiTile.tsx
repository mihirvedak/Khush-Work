import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Chart } from './Chart';
import type Highcharts from 'highcharts';

export interface KpiProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** delta vs the previous comparable period, already expressed in display units */
  delta?: number | null;
  deltaSuffix?: string;
  /** true when a rising number is bad (downtime, losses) */
  invertDelta?: boolean;
  sparkline?: number[];
  target?: number;
  badge?: ReactNode;
  hint?: string;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
  onClick?: () => void;
  className?: string;
}

const TONE_FG: Record<string, string> = {
  default: 'var(--text-primary)',
  ok: '#1E9E5A',
  warn: '#B7791F',
  danger: '#D92D20',
};

/** UI-03 KpiTile: value + unit + delta + sparkline + target marker + drill. */
export function KpiTile({
  label, value, unit, delta, deltaSuffix = '', invertDelta, sparkline, target,
  badge, hint, tone = 'default', onClick, className,
}: KpiProps) {
  const good = delta === null || delta === undefined ? null : invertDelta ? delta <= 0 : delta >= 0;
  const DeltaIcon = delta === null || delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;

  const spark: Highcharts.Options | null = sparkline && sparkline.length > 1
    ? {
        chart: { type: 'area', margin: [2, 0, 2, 0], height: 32, backgroundColor: 'transparent' },
        xAxis: { visible: false },
        yAxis: {
          visible: false,
          plotLines: target !== undefined
            ? [{ value: target, color: '#7A889A', width: 1, dashStyle: 'Dash', zIndex: 3 }]
            : undefined,
        },
        legend: { enabled: false },
        tooltip: { enabled: false },
        accessibility: { enabled: false },
        plotOptions: {
          area: {
            lineWidth: 1.5,
            color: '#1655F2',
            fillColor: { linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 }, stops: [[0, 'rgba(22,85,242,.18)'], [1, 'rgba(22,85,242,0)']] },
            marker: { enabled: false },
          },
        },
        series: [{ type: 'area', data: sparkline }],
      }
    : null;

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={clsx(
        'card flex flex-col gap-1 px-4 py-3 text-left',
        onClick && 'card-interactive hover:border-azure-200 hover:bg-azure-50/40',
        className,
      )}
      title={hint}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="lbl truncate">{label}</span>
        {badge}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="kpi-value text-kpi font-semibold" style={{ color: TONE_FG[tone] }}>
          {value}
        </span>
        {unit && <span className="text-xs text-txt-muted">{unit}</span>}
      </div>

      <div className="flex items-center justify-between gap-2">
        {delta !== null && delta !== undefined ? (
          <span
            className="inline-flex items-center gap-0.5 text-xs font-semibold tnum"
            style={{ color: good === null ? 'var(--text-muted)' : good ? '#1E9E5A' : '#D92D20' }}
          >
            <DeltaIcon size={12} aria-hidden />
            {Math.abs(delta).toFixed(1)}{deltaSuffix}
          </span>
        ) : <span />}
        {target !== undefined && (
          <span className="text-2xs text-txt-muted tnum">target {target}{deltaSuffix || (unit ? ` ${unit}` : '')}</span>
        )}
      </div>

      {spark && <Chart options={spark} height={32} className="-mx-1 mt-0.5" />}
    </Tag>
  );
}

/** Horizontal KPI strip used at the top of every module. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid gap-3', className ?? 'grid-cols-2 md:grid-cols-4 xl:grid-cols-6')}>
      {children}
    </div>
  );
}

/** Compact inline stat for dense strips (timeline header, drawer headers). */
export function Stat({
  label, value, tone, title,
}: { label: string; value: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'danger'; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <span className="text-2xs uppercase tracking-wide text-txt-muted">{label}</span>
      <span className="text-sm font-semibold tnum" style={{ color: TONE_FG[tone ?? 'default'] }}>{value}</span>
    </div>
  );
}
