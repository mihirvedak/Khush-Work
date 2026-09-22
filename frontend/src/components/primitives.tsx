import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  Play, Zap, OctagonAlert, Wrench, Pause, FlaskConical, Moon, WifiOff,
  Cpu, Gauge, Scale, Pencil, Sigma, Database, History, Info,
} from 'lucide-react';
import type { MachineState, Source, Severity, DataState } from '../data/types';
import { stateMeta, SEVERITY, SOURCE_BADGE, DATA_STATE, categoryMeta } from '../lib/states';

/* ------------------------------------------------------------------ icons */

const STATE_ICON: Record<MachineState, typeof Play> = {
  RUN: Play, MICRO: Zap, DOWN: OctagonAlert, PLAN: Wrench,
  IDLE: Pause, HOLD: FlaskConical, NOSCH: Moon, DISC: WifiOff,
};

const SOURCE_ICON: Record<string, typeof Cpu> = {
  PLC: Cpu, Controller: Gauge, Scale, Manual: Pencil,
  Calculated: Sigma, 'LIMS/COA': FlaskConical, ERP: Database,
};

/* ------------------------------------------------- UI-04 StateChip */

/**
 * State is never colour-only: every chip carries icon + text (design theme section 8).
 * Tinted background keeps text contrast >= 12:1 where solid fills would fail AA.
 */
export function StateChip({
  state, size = 'md', ongoing = false, className,
}: { state: MachineState; size?: 'sm' | 'md'; ongoing?: boolean; className?: string }) {
  const m = stateMeta(state);
  const Icon = STATE_ICON[state];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'text-2xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
        className,
      )}
      style={{ background: `${m.fill}24`, color: 'var(--text-primary)' }}
    >
      <Icon size={size === 'sm' ? 11 : 12} style={{ color: m.fill }} aria-hidden />
      {m.label}
      {ongoing && <OngoingDot colour={m.fill} />}
    </span>
  );
}

/** Live "Ongoing" marker - the fix for the Hamilton `NaT` end time (ref 02 #1). */
export function OngoingDot({ colour = '#E5484D' }: { colour?: string }) {
  return (
    <span className="inline-flex items-center gap-1 ml-0.5">
      <span className="fc-pulse inline-block h-1.5 w-1.5 rounded-full" style={{ background: colour }} />
      <span className="text-2xs font-semibold">Ongoing</span>
    </span>
  );
}

/* ------------------------------------------------- UI-05 SourceBadge */

/** Hard rule 3: every value shows where it came from. */
export function SourceBadge({ source, at, className }: { source: Source; at?: number; className?: string }) {
  const meta = SOURCE_BADGE[source] ?? SOURCE_BADGE.Manual;
  const Icon = SOURCE_ICON[source] ?? Pencil;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-2xs font-semibold leading-[14px]',
        className,
      )}
      style={{ borderColor: `${meta.colour}66`, color: meta.colour }}
      title={at ? `${source} - captured ${new Date(at).toISOString()}` : source}
    >
      <Icon size={10} aria-hidden />
      {source}
    </span>
  );
}

/** "Today: DS3 -> Demo: Connected" - makes the paper-to-connected story explicit (ref 01). */
export function DataStateBadge({ state }: { state: DataState }) {
  const m = DATA_STATE[state] ?? DATA_STATE.DSP;
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-txt-muted" title={m.label}>
      <span className="rounded px-1 py-px font-semibold" style={{ background: `${m.colour}1F`, color: m.colour }}>
        Today: {state}
      </span>
      <span aria-hidden>&rarr;</span>
      <span className="rounded px-1 py-px font-semibold" style={{ background: 'rgba(30,158,90,.12)', color: '#0F8A45' }}>
        Demo: Connected
      </span>
    </span>
  );
}

/* ------------------------------------------------- severity / category */

export function SeverityChip({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {severity}
    </span>
  );
}

export function CategoryChip({ category }: { category: string }) {
  const m = categoryMeta(category);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold"
      style={{ background: `${m.colour}1F`, color: 'var(--text-primary)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.colour }} aria-hidden />
      {m.label}
    </span>
  );
}

/* ------------------------------------------------- demo-limit marker */

/** Hard rule 7: every non-OBX limit is flagged until OBX Quality confirms it. */
export function DemoLimitTag({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center rounded px-1 py-px text-2xs font-semibold', className)}
      style={{ background: '#FDF3D8', color: '#B7791F' }}
      title="Demo limit - pending OBX Quality confirmation"
    >
      DEMO
    </span>
  );
}

/** Marks a value OBX actually stated, as opposed to a demo assumption. */
export function ObxLimitTag() {
  return (
    <span
      className="inline-flex items-center rounded px-1 py-px text-2xs font-semibold"
      style={{ background: 'rgba(15,118,110,.12)', color: '#0F766E' }}
      title="Limit stated by OBX"
    >
      OBX
    </span>
  );
}

/* ------------------------------------------------- generic chrome */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('card', className)}>{children}</section>;
}

export function CardHeader({
  title, subtitle, right, info,
}: { title: string; subtitle?: ReactNode; right?: ReactNode; info?: string }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="card-title flex items-center gap-1.5">
          {title}
          {info && (
            <span title={info} className="text-txt-muted" tabIndex={0} role="note" aria-label={info}>
              <Info size={13} />
            </span>
          )}
        </h2>
        {subtitle && <p className="lbl mt-0.5 truncate">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

export function Pill({
  active, onClick, children, title,
}: { active?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-azure-600 bg-azure-600 text-white'
          : 'border-line bg-surface text-txt-secondary hover:bg-subtle',
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-txt-secondary">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={clsx(
          'relative inline-block h-4 w-7 rounded-full transition-colors',
          checked ? 'bg-azure-600' : 'bg-[color:var(--border)]',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
            checked ? 'left-3.5' : 'left-0.5',
          )}
        />
      </span>
      {label}
    </label>
  );
}

/** Info / warning / critical banner (UI-16). */
export function Banner({
  tone = 'info', icon, children, action,
}: { tone?: 'info' | 'warn' | 'danger'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const tones = {
    info: { bg: '#EEF3FF', border: '#B8CCFD', fg: '#0F43C4' },
    warn: { bg: '#FDF3D8', border: '#F0D9A0', fg: '#B7791F' },
    danger: { bg: '#FDECEC', border: '#F6C6C4', fg: '#B42318' },
  }[tone];
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border px-4 py-3 text-sm"
      style={{ background: tones.bg, borderColor: tones.border, color: 'var(--text-primary)' }}
    >
      <span className="mt-px shrink-0" style={{ color: tones.fg }}>{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Back-filled-from-edge-buffer marker - answers the pre-read edge question (story S3). */
export function BackfilledBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-2xs font-semibold"
      style={{ borderColor: '#5B677666', color: '#5B6776' }}
      title="Data recovered from the edge buffer after a network loss on the outdoor pad"
    >
      <History size={10} aria-hidden />
      Back-filled from edge buffer
    </span>
  );
}

/** Monospaced entity id that links to its drawer. */
export function IdLink({ id, onClick }: { id: string; onClick?: () => void }) {
  if (!onClick) return <span className="mono text-txt-secondary">{id}</span>;
  return (
    <button type="button" onClick={onClick} className="mono text-azure-600 hover:underline">
      {id}
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="text-sm font-medium text-txt-secondary">{title}</p>
      {hint && <p className="text-xs text-txt-muted">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-subtle', className)} />;
}
