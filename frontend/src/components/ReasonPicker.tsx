import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, Check } from 'lucide-react';
import type { Reason } from '../data/types';
import { DS } from '../store/useStore';
import { CATEGORIES, categoryMeta } from '../lib/states';

/** Preset "what did you do?" actions per reason family - cuts typing on a tablet (ref 03). */
const ACTION_PRESETS: Record<string, string[]> = {
  E1: ['Changed pump oil', 'Flushed pump', 'Replaced seal / O-ring', 'De-iced cold trap', 'Called maintenance'],
  E2: ['Reset VFD', 'Replaced drive belt', 'Called maintenance', 'Swapped pump'],
  E3: ['Reset TCU', 'Topped up glycol', 'Cleared chiller alarm', 'Called maintenance'],
  E4: ['Re-calibrated probe', 'Replaced probe', 'Buffer-verified', 'Logged in LOG-CAL'],
  E5: ['Reset PLC / HMI', 'Cycled valve', 'Called controls support'],
  R1: ['Held feed until vacuum recovered', 'Reduced feed rate', 'Purged feed line'],
  R2: ['Adjusted jacket setpoint', 'Extended cooling', 'Raised deviation'],
  R3: ['Cleared feed line', 'Applied heat trace', 'Reduced feed rate'],
  R4: ['Extended settle time', 'Added demulsifier', 'Re-settled batch'],
  R5: ['Changed filter cloth', 'Re-filtered', 'Increased vacuum'],
  R6: ['Re-dosed base', 'Slowed dose rate', 'Re-calibrated pH probe'],
  M1: ['Chased material from warehouse', 'Escalated to planning'],
  M2: ['Transferred fresh heptane', 'Re-ran SRU'],
  Q1: ['Chased lab result', 'Escalated to QA'],
  X1: ['Weather hold - shut down per SOP', 'Resumed after all-clear'],
};

export const actionPresets = (code: string) => ACTION_PRESETS[code.slice(0, 2)] ?? ['Resolved on shift', 'Called maintenance'];

/**
 * UI-09 ReasonPicker - tablet-first (48 px targets):
 * quick chips for this asset's top reasons, then category tabs, then the filtered list.
 */
export function ReasonPicker({
  assetId, line, value, onChange, quickCodes,
}: {
  assetId: string;
  line: 'L1' | 'L2';
  value: string | null;
  onChange: (code: string) => void;
  /** top-6 reasons for this asset over the last 30 days */
  quickCodes?: string[];
}) {
  const [cat, setCat] = useState<string>('ALL');
  const [q, setQ] = useState('');

  const applicable = useMemo(
    () => DS.reasons.filter((r) => r.lines.includes(line) && (!r.assetMatch || r.assetMatch.test(assetId))),
    [assetId, line],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return applicable
      .filter((r) => cat === 'ALL' || r.category === cat)
      .filter((r) => !needle || r.label.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle))
      .sort((a, b) => b.weight - a.weight);
  }, [applicable, cat, q]);

  const quick = useMemo(
    () => (quickCodes ?? []).map((c) => applicable.find((r) => r.code === c)).filter(Boolean) as Reason[],
    [quickCodes, applicable],
  );

  return (
    <div className="flex flex-col gap-3">
      {quick.length > 0 && (
        <div>
          <p className="lbl mb-1.5">Top reasons on this asset (last 30 days)</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => onChange(r.code)}
                className={clsx(
                  'min-h-[48px] rounded-ctl border px-3 py-2 text-left text-xs font-medium',
                  value === r.code
                    ? 'border-azure-600 bg-azure-50 text-azure-700'
                    : 'border-line bg-surface hover:bg-subtle',
                )}
              >
                <span className="mono block text-2xs text-txt-muted">{r.code}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <CatTab id="ALL" label="All" active={cat === 'ALL'} onClick={setCat} />
        {Object.keys(CATEGORIES)
          .filter((c) => c !== 'UNK')
          .map((c) => (
            <CatTab key={c} id={c} label={c} active={cat === c} onClick={setCat} title={CATEGORIES[c].label} />
          ))}
      </div>

      <label className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search reason or code"
          aria-label="Search reason"
          className="w-full rounded-ctl border border-line bg-subtle py-2 pl-7 pr-2 text-xs"
        />
      </label>

      <ul className="max-h-64 divide-y divide-[color:var(--border)] overflow-auto rounded-ctl border border-line">
        {list.length === 0 && <li className="p-3 text-xs text-txt-muted">No reason matches.</li>}
        {list.map((r) => {
          const m = categoryMeta(r.category);
          return (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => onChange(r.code)}
                className={clsx(
                  'flex min-h-[48px] w-full items-center gap-2 px-3 py-2 text-left text-xs',
                  value === r.code ? 'bg-azure-50' : 'hover:bg-subtle',
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.colour }} aria-hidden />
                <span className="mono w-12 shrink-0 text-txt-muted">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-txt-primary">{r.label}</span>
                <span className="shrink-0 text-2xs text-txt-muted">{r.group}</span>
                {value === r.code && <Check size={14} className="shrink-0 text-azure-600" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CatTab({
  id, label, active, onClick, title,
}: { id: string; label: string; active: boolean; onClick: (id: string) => void; title?: string }) {
  const m = id === 'ALL' ? null : categoryMeta(id);
  return (
    <button
      type="button"
      title={title}
      onClick={() => onClick(id)}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
        active ? 'border-azure-600 bg-azure-600 text-white' : 'border-line bg-surface text-txt-secondary hover:bg-subtle',
      )}
    >
      {m && <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#fff' : m.colour }} aria-hidden />}
      {label}
    </button>
  );
}

/** Top-N reason codes seen on an asset in the window - feeds the quick chips. */
export function topReasonsFor(assetId: string, n = 6): string[] {
  const acc = new Map<string, number>();
  for (const e of DS.events) {
    if (e.assetId !== assetId || !e.reasonCode || e.reasonCode === 'U000') continue;
    acc.set(e.reasonCode, (acc.get(e.reasonCode) ?? 0) + 1);
  }
  return [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);
}
