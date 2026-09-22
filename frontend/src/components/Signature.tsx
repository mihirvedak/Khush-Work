import { useState } from 'react';
import clsx from 'clsx';
import { ShieldCheck, Lock, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { fmtTs } from '../lib/time';

export type SignMeaning = 'Performed' | 'Reviewed' | 'Approved' | 'Verified';

/**
 * UI-11 SignatureDialog - Part-11-ready wording: unique user, password re-entry,
 * explicit meaning of signature, timestamp, and reason-for-change on corrections.
 * Whether OBX needs formal 21 CFR Part 11 is an onsite question; we design for it (ref 06).
 */
export function SignatureDialog({
  open, onClose, onSign, meaning, entity, requireReason = false,
}: {
  open: boolean;
  onClose: () => void;
  onSign: (payload: { meaning: SignMeaning; reason?: string }) => void;
  meaning: SignMeaning;
  entity: string;
  requireReason?: boolean;
}) {
  const { user, role, now } = useStore();
  const [pw, setPw] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const submit = () => {
    if (!pw) { setErr('Re-enter your password to sign.'); return; }
    if (requireReason && !reason.trim()) { setErr('A reason for change is required.'); return; }
    onSign({ meaning, reason: reason.trim() || undefined });
    setPw(''); setReason(''); setErr('');
    onClose();
  };

  return (
    <div className="fc-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4" role="dialog" aria-modal aria-label="Electronic signature">
      <div className="fc-pop-in w-full max-w-md rounded-card border border-line bg-surface shadow-drawer">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <ShieldCheck size={16} className="text-azure-600" aria-hidden />
          <h2 className="card-title">Electronic signature</h2>
        </header>

        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-txt-secondary">
            You are signing <span className="mono text-txt-primary">{entity}</span>.
          </p>

          <div className="rounded-ctl border border-line bg-subtle px-3 py-2 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-txt-muted">Meaning of signature</span>
              <span className="font-semibold text-txt-primary">{meaning}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-muted">Signed by</span>
              <span className="font-semibold text-txt-primary">{user} &middot; {role}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-muted">Timestamp (ET)</span>
              <span className="mono text-txt-primary">{fmtTs(now)}</span>
            </div>
          </div>

          <label className="block">
            <span className="lbl">Password</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Re-enter password"
              autoFocus
              className="mt-1 w-full rounded-ctl border border-line bg-surface px-2 py-2 text-sm"
            />
            <span className="mt-1 block text-2xs text-txt-muted">Demo: any value is accepted.</span>
          </label>

          {requireReason && (
            <label className="block">
              <span className="lbl">Reason for change</span>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setErr(''); }}
                rows={2}
                className="mt-1 w-full rounded-ctl border border-line bg-surface px-2 py-1.5 text-sm"
                placeholder="Why is this record being corrected?"
              />
            </label>
          )}

          {err && <p className="text-xs font-medium text-danger">{err}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ctl border border-line px-3 py-1.5 text-xs font-medium text-txt-secondary hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-ctl bg-azure-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-azure-700"
          >
            <Lock size={12} aria-hidden />
            Sign as {meaning}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * UI-15 EscalationStepper: L1 Operator -> L2 Supervisor -> L3 Production Mgr / QA -> L4 Plant Head
 * with timestamps and SLA state.
 */
export function EscalationStepper({
  level, acknowledged, labels = ['Operator', 'Shift Supervisor', 'Production Mgr / QA', 'Plant Head'], times,
}: {
  level: 1 | 2 | 3 | 4;
  acknowledged?: boolean;
  labels?: string[];
  times?: (number | null)[];
}) {
  return (
    <ol className="flex items-stretch gap-1" aria-label="Escalation level">
      {labels.map((l, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const reached = n <= level;
        const current = n === level && !acknowledged;
        return (
          <li key={l} className="flex min-w-0 flex-1 items-center gap-1">
            <div
              className={clsx(
                'min-w-0 flex-1 rounded-ctl border px-2 py-1.5',
                current
                  ? 'border-danger bg-danger-bg'
                  : reached
                    ? 'border-azure-200 bg-azure-50'
                    : 'border-line bg-surface',
              )}
            >
              <div className="flex items-center gap-1">
                <span
                  className={clsx(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                    current ? 'bg-danger text-white' : reached ? 'bg-azure-600 text-white' : 'bg-subtle text-txt-muted',
                  )}
                >
                  {n}
                </span>
                <span className="truncate text-2xs font-semibold text-txt-primary">{l}</span>
              </div>
              {times?.[i] ? (
                <span className="mono mt-0.5 block text-2xs text-txt-muted">{fmtTs(times[i] as number)}</span>
              ) : null}
            </div>
            {i < labels.length - 1 && <ChevronRight size={12} className="shrink-0 text-txt-muted" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
