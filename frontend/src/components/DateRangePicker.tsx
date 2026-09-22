import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Clock } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { TZ, DAY, startOfEtDay } from '../lib/time';

export type PresetKey =
  | 'custom' | 'currentShift' | 'last24h' | 'today' | 'yesterday'
  | 'currentWeek' | 'previousWeek' | 'previous7Days'
  | 'currentMonth' | 'previousMonth' | 'previous3Months' | 'previous12Months'
  | 'currentYear' | 'previousYear';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'custom', label: 'Custom' },
  { key: 'currentShift', label: 'Current Shift' },
  { key: 'last24h', label: 'Last 24 Hours' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'currentWeek', label: 'Current Week' },
  { key: 'previousWeek', label: 'Previous Week' },
  { key: 'previous7Days', label: 'Previous 7 Days' },
  { key: 'currentMonth', label: 'Current Month' },
  { key: 'previousMonth', label: 'Previous Month' },
  { key: 'previous3Months', label: 'Previous 3 Months' },
  { key: 'previous12Months', label: 'Previous 12 Months' },
  { key: 'currentYear', label: 'Current Year' },
  { key: 'previousYear', label: 'Previous Year' },
];

/** `22 Jul 2026` */
export const fmtDisplayDate = (t: number) => formatInTimeZone(t, TZ, 'dd MMM yyyy');
/** `2026-07-22` for the date inputs */
const toDateInput = (t: number) => formatInTimeZone(t, TZ, 'yyyy-MM-dd');
/** `07:00` for the time inputs */
const toTimeInput = (t: number) => formatInTimeZone(t, TZ, 'HH:mm');

/** Build an epoch from an ET wall-clock date + time, DST-correct. */
function fromEt(dateStr: string, timeStr: string, near: number): number {
  const offset = formatInTimeZone(near, TZ, 'xxx');
  const t = new Date(`${dateStr}T${timeStr}:00${offset}`).getTime();
  return Number.isFinite(t) ? t : near;
}

export function DateRangePicker({
  preset, from, to, now, onApply,
}: {
  preset: PresetKey;
  from: number;
  to: number;
  now: number;
  onApply: (p: PresetKey, custom?: { from: number; to: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PresetKey>(preset);
  const [startDate, setStartDate] = useState(toDateInput(from));
  const [startTime, setStartTime] = useState(toTimeInput(from));
  const [endDate, setEndDate] = useState(toDateInput(to));
  const [endTime, setEndTime] = useState(toTimeInput(to));
  const [cursor, setCursor] = useState(() => startOfEtDay(to));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // re-sync the fields whenever the picker opens on a new range
  useEffect(() => {
    if (!open) return;
    setTab(preset);
    setStartDate(toDateInput(from)); setStartTime(toTimeInput(from));
    setEndDate(toDateInput(to)); setEndTime(toTimeInput(to));
    setCursor(startOfEtDay(to));
  }, [open, preset, from, to]);

  const label = PRESETS.find((p) => p.key === preset)?.label ?? 'Custom';

  const apply = () => {
    if (tab === 'custom') {
      const f = fromEt(startDate, startTime, from);
      const t = fromEt(endDate, endTime, to);
      onApply('custom', { from: Math.min(f, t), to: Math.max(f, t) });
    } else {
      onApply(tab);
    }
    setOpen(false);
  };

  // calendar grid for the visible month, in plant time
  const grid = useMemo(() => buildMonth(cursor), [cursor]);
  const selStart = fromEt(startDate, '00:00', from);
  const selEnd = fromEt(endDate, '00:00', to);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-ctl border border-azure-200 bg-azure-50 py-1 pl-1 pr-2.5 text-xs"
      >
        <span className="rounded bg-ink px-2 py-1 text-2xs font-semibold text-white">{label}</span>
        <span className="font-semibold text-azure-700">
          {fmtDisplayDate(from)} &ndash; {fmtDisplayDate(to)}
        </span>
        <Calendar size={14} className="text-azure-600" aria-hidden />
        <ChevronDown size={12} className="text-azure-600" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 flex w-[640px] overflow-hidden rounded-card border border-line bg-surface shadow-drawer">
          {/* preset rail */}
          <ul className="w-44 shrink-0 border-r border-line py-1.5">
            {PRESETS.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setTab(p.key)}
                  className={clsx(
                    'w-full px-3 py-1.5 text-left text-xs',
                    tab === p.key ? 'bg-azure-600 font-semibold text-white' : 'text-txt-secondary hover:bg-subtle',
                  )}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>

          {/* custom fields + calendar */}
          <div className="min-w-0 flex-1 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Labelled label="Start Date" required>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setTab('custom'); }}
                  className="w-full rounded-ctl border border-line bg-subtle px-2 py-1.5 text-xs"
                />
              </Labelled>
              <Labelled label="Start Time" required accent>
                <span className="relative block">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); setTab('custom'); }}
                    className="w-full rounded-ctl border border-line bg-subtle px-2 py-1.5 pr-7 text-xs"
                  />
                  <Clock size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-txt-muted" aria-hidden />
                </span>
              </Labelled>
              <Labelled label="End Date" required>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setTab('custom'); }}
                  className="w-full rounded-ctl border border-line bg-subtle px-2 py-1.5 text-xs"
                />
              </Labelled>
              <Labelled label="End Time" required accent>
                <span className="relative block">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => { setEndTime(e.target.value); setTab('custom'); }}
                    className="w-full rounded-ctl border border-line bg-subtle px-2 py-1.5 pr-7 text-xs"
                  />
                  <Clock size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-txt-muted" aria-hidden />
                </span>
              </Labelled>
            </div>

            {/* month grid */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCursor((c) => shiftMonth(c, -1))}
                  className="rounded border border-line p-1 text-txt-secondary hover:bg-subtle"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-xs font-semibold">{formatInTimeZone(cursor, TZ, 'MMMM yyyy')}</span>
                <button
                  type="button"
                  onClick={() => setCursor((c) => shiftMonth(c, 1))}
                  className="rounded border border-line p-1 text-txt-secondary hover:bg-subtle"
                  aria-label="Next month"
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0.5 text-center">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <span key={d} className="py-1 text-2xs font-semibold text-txt-muted">{d}</span>
                ))}
                {grid.map(({ t, inMonth }) => {
                  const dayStart = startOfEtDay(t);
                  const isStart = dayStart === startOfEtDay(selStart);
                  const isEnd = dayStart === startOfEtDay(selEnd);
                  const inRange = dayStart > startOfEtDay(selStart) && dayStart < startOfEtDay(selEnd);
                  const future = dayStart > now;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={future}
                      onClick={() => {
                        setTab('custom');
                        // first click sets the start, second (later date) sets the end
                        if (dayStart < selStart || startOfEtDay(selStart) !== startOfEtDay(selEnd)) {
                          setStartDate(toDateInput(dayStart));
                          setEndDate(toDateInput(dayStart));
                        } else {
                          setEndDate(toDateInput(dayStart));
                        }
                      }}
                      className={clsx(
                        'rounded py-1.5 text-xs',
                        !inMonth && 'text-txt-muted opacity-50',
                        future && 'cursor-not-allowed opacity-30',
                        isStart || isEnd
                          ? 'bg-azure-600 font-semibold text-white'
                          : inRange
                            ? 'bg-azure-50 text-azure-700'
                            : 'hover:bg-subtle',
                      )}
                    >
                      {formatInTimeZone(t, TZ, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-ctl border border-line px-3 py-1.5 text-xs font-medium text-txt-secondary hover:bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-ctl bg-azure-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-azure-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Labelled({ label, required, accent, children }: { label: string; required?: boolean; accent?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={clsx('mb-1 block text-2xs font-semibold', accent ? 'text-azure-600' : 'text-danger')}>
        {label} {required && '*'}
      </span>
      {children}
    </label>
  );
}

function shiftMonth(t: number, delta: number): number {
  const y = Number(formatInTimeZone(t, TZ, 'yyyy'));
  const m = Number(formatInTimeZone(t, TZ, 'M')) - 1 + delta;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return new Date(Date.UTC(ny, nm, 15, 12)).getTime();
}

/** 6x7 day grid covering the month that contains `cursor`, in plant time. */
function buildMonth(cursor: number): { t: number; inMonth: boolean }[] {
  const month = formatInTimeZone(cursor, TZ, 'M');
  const firstOfMonth = startOfEtDay(
    new Date(`${formatInTimeZone(cursor, TZ, 'yyyy-MM')}-01T12:00:00Z`).getTime(),
  );
  const dow = Number(formatInTimeZone(firstOfMonth, TZ, 'i')) % 7; // 1=Mon..7=Sun -> 0=Sun
  const start = firstOfMonth - dow * DAY;
  return Array.from({ length: 42 }, (_, i) => {
    const t = startOfEtDay(start + i * DAY + 12 * 3_600_000);
    return { t, inMonth: formatInTimeZone(t, TZ, 'M') === month };
  });
}
