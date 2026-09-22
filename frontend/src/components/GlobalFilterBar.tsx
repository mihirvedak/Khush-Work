import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { X, ChevronDown, Search, Download } from 'lucide-react';
import { useStore, DS, useRange, isRangeKey, type RangeKey } from '../store/useStore';
import type { LineId, ShiftId } from '../data/types';
import { DateRangePicker } from './DateRangePicker';

const LINES: { id: LineId | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All Lines' },
  { id: 'L1', label: 'L1 Kratom / MIT' },
  { id: 'L2', label: 'L2 Bulk Cannabinoids' },
];

/**
 * UI-02 GlobalFilterBar: Line -> Machine -> Shift -> date range, mirrored into the URL
 * so a pasted link reproduces exactly the view the presenter was on.
 */
export function GlobalFilterBar() {
  const {
    line, assetIds, shift, rangeKey, search, now,
    setLine, setShift, setRange, setSearch, toggleAsset, setAssets, clearFilters,
  } = useStore();
  const range = useRange();
  const [params, setParams] = useSearchParams();
  const [assetOpen, setAssetOpen] = useState(false);
  const assetRef = useRef<HTMLDivElement>(null);

  // hydrate from the URL once on mount
  useEffect(() => {
    const l = params.get('line') as LineId | 'ALL' | null;
    const s = params.get('shift') as ShiftId | 'ALL' | null;
    const r = params.get('range');
    const a = params.get('assets');
    if (l) setLine(l);
    if (s) setShift(s);
    if (isRangeKey(r)) setRange(r);
    if (a) setAssets(a.split(',').filter(Boolean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(params);
    line === 'ALL' ? next.delete('line') : next.set('line', line);
    shift === 'ALL' ? next.delete('shift') : next.set('shift', shift);
    next.set('range', rangeKey);
    assetIds.length ? next.set('assets', assetIds.join(',')) : next.delete('assets');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, shift, rangeKey, assetIds]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (assetRef.current && !assetRef.current.contains(e.target as Node)) setAssetOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const assets = DS.assets.filter((a) => line === 'ALL' || a.line === line);
  const activeCount = (line !== 'ALL' ? 1 : 0) + (shift !== 'ALL' ? 1 : 0) + (assetIds.length ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
      {/* Line */}
      <select
        value={line}
        onChange={(e) => setLine(e.target.value as LineId | 'ALL')}
        aria-label="Line"
        className="rounded-ctl border border-line bg-surface px-2 py-1.5 text-xs font-medium text-txt-primary"
      >
        {LINES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>

      {/* Machine (multi) */}
      <div className="relative" ref={assetRef}>
        <button
          type="button"
          onClick={() => setAssetOpen((v) => !v)}
          aria-expanded={assetOpen}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-ctl border px-2.5 py-1.5 text-xs font-medium',
            assetIds.length ? 'border-azure-600 bg-azure-50 text-azure-700' : 'border-line bg-surface text-txt-primary hover:bg-subtle',
          )}
        >
          {assetIds.length === 0
            ? 'All Machines'
            : assetIds.length === 1
              ? assetIds[0]
              : `${assetIds.length} machines`}
          <ChevronDown size={12} />
        </button>
        {assetOpen && (
          <div className="absolute left-0 z-40 mt-1 max-h-80 w-72 overflow-auto rounded-card border border-line bg-surface p-2 shadow-drawer">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="lbl">Machines</span>
              <button type="button" onClick={() => setAssets([])} className="text-2xs font-semibold text-azure-600 hover:underline">
                Clear
              </button>
            </div>
            {['Outdoor Pad', 'Kratom Process Room', 'Bulk Suite'].map((area) => {
              const inArea = assets.filter((a) => a.area === area);
              if (!inArea.length) return null;
              return (
                <div key={area} className="mb-1">
                  <p className="px-1 py-0.5 text-2xs font-semibold uppercase tracking-wide text-txt-muted">{area}</p>
                  {inArea.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-subtle">
                      <input type="checkbox" checked={assetIds.includes(a.id)} onChange={() => toggleAsset(a.id)} />
                      <span className="mono text-txt-secondary">{a.id}</span>
                      <span className="truncate text-txt-muted">{a.name}</span>
                      {a.isConstraint && (
                        <span className="ml-auto rounded bg-azure-50 px-1 text-[9px] font-bold text-azure-700" title="Constraint asset - drives line OEE">
                          CONSTRAINT
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shift */}
      <div className="inline-flex overflow-hidden rounded-ctl border border-line">
        {(['ALL', 'A', 'B'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShift(s)}
            aria-pressed={shift === s}
            title={s === 'A' ? 'Shift A 06:00-18:00 ET' : s === 'B' ? 'Shift B 18:00-06:00 ET' : 'Both shifts'}
            className={clsx(
              'px-2.5 py-1.5 text-xs font-medium',
              shift === s ? 'bg-azure-600 text-white' : 'bg-surface text-txt-secondary hover:bg-subtle',
            )}
          >
            {s === 'ALL' ? 'All Shifts' : `Shift ${s}`}
          </button>
        ))}
      </div>

      {/* Date range */}
      <DateRangePicker
        preset={rangeKey}
        from={range.from}
        to={range.to}
        now={now}
        onApply={(p, c) => setRange(p, c)}
      />

      {/* Batch search */}
      <label className="relative ml-auto">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted" aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Batch / lot / drum ID"
          aria-label="Search batch, lot or drum"
          className="w-48 rounded-ctl border border-line bg-subtle py-1.5 pl-7 pr-2 text-xs placeholder:text-txt-muted"
        />
      </label>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1 rounded-ctl border border-line px-2 py-1.5 text-xs text-txt-secondary hover:bg-subtle"
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}

export { Download };
export type { RangeKey };
