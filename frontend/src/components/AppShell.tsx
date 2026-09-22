import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, GanttChartSquare, OctagonAlert, FlaskConical, TrendingUp, Activity,
  ClipboardList, GitBranch, Sparkles, Bell, Sun, Moon, RotateCcw,
  ChevronDown, Radio, Pin, PinOff, NotebookPen,
} from 'lucide-react';
import { useStore, DS, USER_BY_ROLE } from '../store/useStore';
import { fmtTs } from '../lib/time';
import { escalationMetrics } from '../lib/selectors';
import type { Role } from '../data/types';
import { GlobalFilterBar } from './GlobalFilterBar';
import { BrucePanel } from './BrucePanel';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  children?: { to: string; label: string; icon: typeof LayoutDashboard }[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/timeline', label: 'Machine Timeline', icon: GanttChartSquare },
  { to: '/oee', label: 'OEE Dashboard', icon: TrendingUp },
  {
    to: '/data-logger',
    label: 'Data Logger',
    icon: NotebookPen,
    children: [
      { to: '/data-logger?tab=downtime', label: 'Downtime Logger', icon: OctagonAlert },
      { to: '/data-logger?tab=rejection', label: 'Rejection Logger', icon: FlaskConical },
    ],
  },
  { to: '/process', label: 'Process Parameters', icon: Activity },
  { to: '/logbooks', label: 'Logbooks', icon: ClipboardList },
  { to: '/genealogy', label: 'Batch Genealogy', icon: GitBranch },
];

/** Close a popover when the user clicks outside it or presses Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

/**
 * UI-01 AppShell. The nav is a 64 px rail that expands to 232 px on hover and can be
 * pinned open; the content never reflows, so hovering the nav does not shift charts.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { now, live, setLive, fastClock, setFastClock, theme, setTheme, role, setRole, overlay, resetDemo, tick, setBruceOpen } = useStore();
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const loc = useLocation();

  const roleRef = useDismiss(roleOpen, () => setRoleOpen(false));
  const bellRef = useDismiss(bellOpen, () => setBellOpen(false));

  const expanded = pinned || hovering;

  useEffect(() => {
    const id = setInterval(() => tick(), 5000);
    return () => clearInterval(id);
  }, [tick]);

  const esc = escalationMetrics(DS.escalations, overlay);

  return (
    <div className="flex h-full overflow-hidden">
      {/* nav rail - fixed 64 px footprint, overlay expands on hover */}
      <div className="relative w-16 shrink-0">
        <nav
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={clsx(
            'absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-navy-900 text-[#A7B5C6] transition-[width] duration-200',
            expanded ? 'w-[232px] shadow-drawer' : 'w-16',
          )}
          aria-label="Main"
        >
          {/* client brand */}
          <div className="flex h-14 items-center gap-2.5 px-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-white font-display text-xs font-bold text-navy-900">
              OBX
            </span>
            <span className={clsx('min-w-0 transition-opacity duration-150', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>
              <span className="block truncate font-display text-sm font-bold text-white">Open Book Extracts</span>
              <span className="block truncate text-2xs text-[#7A8BA0]">Roxboro, NC</span>
            </span>
          </div>

          <ul className="mt-2 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2">
            {NAV.map((n) => {
              const Icon = n.icon;
              const base = n.to.split('?')[0];
              const active = n.end ? loc.pathname === base : loc.pathname.startsWith(base);
              return (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    title={n.label}
                    className={clsx(
                      'relative flex items-center gap-3 rounded-ctl py-2 pl-2.5 pr-2 text-xs font-medium transition-colors',
                      active ? 'bg-[#1A2C40] text-white' : 'hover:bg-[#1A2C40]/60 hover:text-white',
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-highlight" aria-hidden />}
                    <Icon size={17} className="shrink-0" aria-hidden />
                    <span className={clsx('truncate transition-opacity duration-150', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                      {n.label}
                    </span>
                  </NavLink>

                  {/* sub-items only make sense once the rail is open */}
                  {n.children && active && expanded && (
                    <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-[#2A3D52] pl-2">
                      {n.children.map((c) => {
                        const CIcon = c.icon;
                        const tab = c.to.split('tab=')[1];
                        const onTab = loc.pathname.startsWith(base)
                          && (new URLSearchParams(loc.search).get('tab') ?? 'downtime') === tab;
                        return (
                          <li key={c.to}>
                            <NavLink
                              to={c.to}
                              className={clsx(
                                'flex items-center gap-2 rounded-ctl px-2 py-1.5 text-[11px] font-medium transition-colors',
                                onTab ? 'bg-[#1A2C40] text-white' : 'text-[#7A8BA0] hover:bg-[#1A2C40]/60 hover:text-white',
                              )}
                            >
                              <CIcon size={13} className="shrink-0" aria-hidden />
                              <span className="truncate">{c.label}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            className="m-2 flex items-center gap-3 rounded-ctl py-2 pl-2.5 pr-2 text-xs hover:bg-[#1A2C40]"
            aria-pressed={pinned}
            aria-label={pinned ? 'Unpin navigation' : 'Pin navigation open'}
          >
            {pinned ? <PinOff size={16} className="shrink-0" /> : <Pin size={16} className="shrink-0" />}
            <span className={clsx('truncate transition-opacity duration-150', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>
              {pinned ? 'Unpin menu' : 'Pin menu'}
            </span>
          </button>

          <div className={clsx('px-4 pb-3 transition-opacity duration-150', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            <span className="text-[10px] text-[#5B6776]">Powered by Faclon I/O Sense</span>
          </div>
        </nav>
      </div>

      {/* main column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-navy-900 px-4 text-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">OBX Roxboro, NC</span>
            <span className="rounded bg-[#1A2C40] px-1.5 py-0.5 text-2xs text-[#A7B5C6]">2 lines &middot; 23 assets</span>
          </div>

          <span
            className="ml-1 rounded-full border border-[#F2B632] px-2 py-0.5 text-2xs font-semibold text-[#F2B632]"
            title="All values on these screens are synthetic, generated for this demo. Not OBX production data."
          >
            Demo data - synthetic
          </span>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLive(!live)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1A2C40] px-2.5 py-1 text-2xs font-semibold"
              aria-pressed={live}
              title={live ? 'Pause the demo clock' : 'Resume the demo clock'}
            >
              <Radio size={11} className={clsx(live ? 'fc-pulse text-highlight' : 'text-[#7A8BA0]')} aria-hidden />
              {live ? 'Live' : 'Paused'}
            </button>

            <span className="mono hidden text-xs text-[#A7B5C6] lg:block" title="Plant time - America/New_York">
              {fmtTs(now)} ET
            </span>

            <button
              type="button"
              onClick={() => setFastClock(!fastClock)}
              className={clsx('rounded px-2 py-1 text-2xs font-semibold', fastClock ? 'bg-[#F2B632] text-ink' : 'bg-[#1A2C40] text-[#A7B5C6]')}
              title="Accelerated demo clock: 1 tick = 1 hour, so escalation timers advance visibly"
            >
              {fastClock ? '1 tick = 1 h' : 'Normal clock'}
            </button>

            <button
              type="button"
              onClick={() => setBruceOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#6E56CF] to-[#1655F2] px-2.5 py-1.5 text-2xs font-semibold text-white"
              title="Ask Bruce AI about the plant"
            >
              <Sparkles size={12} /> Bruce AI
            </button>

            <div className="relative" ref={bellRef}>
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                className="relative rounded p-1.5 hover:bg-[#1A2C40]"
                aria-label={`${esc.open} open escalations`}
                aria-expanded={bellOpen}
              >
                <Bell size={16} />
                {esc.open > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#E5484D] px-1 text-[9px] font-bold text-white">
                    {esc.open > 99 ? '99+' : esc.open}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-card border border-line bg-surface p-3 text-txt-primary shadow-drawer">
                  <h3 className="card-title mb-2">Escalations</h3>
                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between"><dt className="text-txt-secondary">Open</dt><dd className="font-semibold tnum">{esc.open}</dd></div>
                    <div className="flex justify-between"><dt className="text-txt-secondary">At L3 / L4</dt><dd className="font-semibold tnum">{esc.byLevel[3] + esc.byLevel[4]}</dd></div>
                    <div className="flex justify-between"><dt className="text-txt-secondary">SLA adherence</dt><dd className="font-semibold tnum">{(esc.slaAdherence * 100).toFixed(1)}%</dd></div>
                  </dl>
                  <NavLink to="/logbooks?tab=escalations" onClick={() => setBellOpen(false)} className="mt-2 block text-xs font-semibold text-azure-600 hover:underline">
                    Open escalation matrix &rarr;
                  </NavLink>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="rounded p-1.5 hover:bg-[#1A2C40]"
              aria-label="Toggle dark mode"
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            <button
              type="button"
              onClick={resetDemo}
              className="rounded p-1.5 hover:bg-[#1A2C40]"
              title="Reset demo - clears every action taken during the walkthrough"
              aria-label="Reset demo"
            >
              <RotateCcw size={15} />
            </button>

            <div className="relative" ref={roleRef}>
              <button
                type="button"
                onClick={() => setRoleOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-ctl bg-[#1A2C40] px-2 py-1.5 text-2xs"
                aria-expanded={roleOpen}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-azure-600 text-[9px] font-bold text-white">
                  {USER_BY_ROLE[role].split(' ').map((p) => p[0]).join('').slice(0, 2)}
                </span>
                <span className="hidden text-left lg:block">
                  <span className="block font-semibold text-white">{USER_BY_ROLE[role]}</span>
                  <span className="block text-[#7A8BA0]">{role}</span>
                </span>
                <ChevronDown size={12} />
              </button>
              {roleOpen && (
                <ul className="absolute right-0 z-50 mt-2 w-52 rounded-card border border-line bg-surface p-1 text-txt-primary shadow-drawer">
                  {(Object.keys(USER_BY_ROLE) as Role[]).map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => { setRole(r); setRoleOpen(false); }}
                        className={clsx('flex w-full flex-col rounded px-2 py-1.5 text-left text-xs hover:bg-subtle', r === role && 'bg-azure-50')}
                      >
                        <span className="font-semibold">{USER_BY_ROLE[r]}</span>
                        <span className="text-2xs text-txt-muted">{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </header>

        <GlobalFilterBar />

        {/* the only scrolling region */}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>

      <BrucePanel />
    </div>
  );
}
