import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

/** UI-08 EntityDrawer: right-hand panel, 480 px (640 for forms), Esc to close. */
export function Drawer({
  open, onClose, title, subtitle, width = 480, tabs, footer, children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  tabs?: { id: string; label: string; content: ReactNode }[];
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.id ?? '');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (tabs?.length && !tabs.some((t) => t.id === tab)) setTab(tabs[0].id); }, [tabs, tab]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal aria-label={typeof title === 'string' ? title : 'Details'}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fc-fade flex-1 bg-ink/25"
      />
      <aside
        className="fc-drawer-in flex h-full flex-col border-l border-line bg-surface shadow-drawer"
        style={{ width: Math.min(width, typeof window === 'undefined' ? width : window.innerWidth - 32) }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="card-title truncate">{title}</h2>
            {subtitle && <div className="lbl mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-txt-muted hover:bg-subtle hover:text-txt-secondary"
          >
            <X size={16} />
          </button>
        </header>

        {tabs && tabs.length > 1 && (
          <nav className="flex gap-1 border-b border-line px-3 pt-2" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'rounded-t px-3 py-1.5 text-xs font-medium',
                  tab === t.id
                    ? 'border-b-2 border-azure-600 text-azure-600'
                    : 'text-txt-secondary hover:text-txt-primary',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {tabs ? tabs.find((t) => t.id === tab)?.content : children}
        </div>

        {footer && <footer className="border-t border-line px-4 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

/** Label / value row used throughout drawers. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="lbl shrink-0">{label}</span>
      <span className="min-w-0 text-right text-sm text-txt-primary">{children}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-txt-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Audit trail list - every write shows who/when/what/old/new/reason. */
export function AuditTrail({
  entries,
}: { entries: { at: string; by: string; what: string; from?: string; to?: string; reason?: string }[] }) {
  if (!entries.length) return <p className="text-xs text-txt-muted">No changes recorded.</p>;
  return (
    <ol className="space-y-2">
      {entries.map((e, i) => (
        <li key={i} className="border-l-2 border-line pl-3 text-xs">
          <div className="font-medium text-txt-primary">{e.what}</div>
          {(e.from || e.to) && (
            <div className="text-txt-secondary">
              {e.from && <span className="line-through">{e.from}</span>}
              {e.from && e.to && <span aria-hidden> &rarr; </span>}
              {e.to && <span className="font-semibold">{e.to}</span>}
            </div>
          )}
          {e.reason && <div className="text-txt-muted">Reason: {e.reason}</div>}
          <div className="mono mt-0.5 text-txt-muted">{e.at} &middot; {e.by}</div>
        </li>
      ))}
    </ol>
  );
}
