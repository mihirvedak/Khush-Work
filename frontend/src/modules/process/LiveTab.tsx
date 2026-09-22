import { useMemo } from 'react';
import { useStore, DS } from '../../store/useStore';
import { valueAt, eventAt } from '../../data/index';
import { withUnit, unitLabel, valueDp } from '../../lib/format';
import { SourceBadge, DataStateBadge, DemoLimitTag, ObxLimitTag, StateChip } from '../../components/primitives';
import { fmtTimeSec } from '../../lib/time';
import type { TagDef } from '../../data/types';

/** Limits OBX actually stated - everything else is a demo assumption (ref 01 section 9). */
const OBX_STATED = new Set(['CRASH_END_T', 'PRE_ACID_T', 'COOK_T']);

function limitState(v: number, t: TagDef): 'ok' | 'warn' | 'danger' {
  if (t.usl !== undefined && v > t.usl) return 'danger';
  if (t.lsl !== undefined && v < t.lsl) return 'danger';
  // within 10 % of the band edge counts as approaching
  if (t.usl !== undefined && t.lsl !== undefined) {
    const band = t.usl - t.lsl;
    if (v > t.usl - band * 0.1 || v < t.lsl + band * 0.1) return 'warn';
  } else if (t.usl !== undefined && v > t.usl * 0.9) return 'warn';
  return 'ok';
}

export function LiveTab({ assetId }: { assetId: string }) {
  const { now } = useStore();
  const tags = useMemo(() => DS.tags.filter((t) => t.assetId === assetId), [assetId]);
  const ev = eventAt(DS, assetId, now);

  const values = useMemo(
    () => tags.map((t) => ({ tag: t, v: valueAt(DS, assetId, t.key, now) })),
    [tags, assetId, now],
  );

  if (!tags.length) {
    return <p className="text-sm text-txt-secondary">No tags are configured for this asset.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-subtle px-3 py-2">
        <span className="lbl">Machine state now</span>
        {ev ? <StateChip state={ev.state} ongoing={ev.end === null && ev.state !== 'RUN'} /> : <span className="text-xs">-</span>}
        {ev?.phase && <span className="text-xs text-txt-secondary">Phase <b>{ev.phase}</b></span>}
        {ev?.batchId && <span className="mono text-xs text-txt-secondary">{ev.batchId}</span>}
        <span className="ml-auto mono text-2xs text-txt-muted">sampled {fmtTimeSec(now)} ET</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {values.map(({ tag, v }) => {
          const st = limitState(v, tag);
          const sp = tags.find((x) => x.key === tag.key.replace('_PV', '_SP'));
          const spVal = sp ? valueAt(DS, assetId, sp.key, now) : null;
          const isObx = OBX_STATED.has(tag.key);
          return (
            <article
              key={tag.key}
              className="card px-3 py-2.5"
              style={{ borderColor: st === 'danger' ? '#F6C6C4' : undefined, background: st === 'danger' ? '#FDECEC' : undefined }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-txt-primary" title={tag.label}>{tag.label}</div>
                  <div className="mono text-2xs text-txt-muted">{tag.key}</div>
                </div>
                <SourceBadge source={tag.source} />
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span
                  className="text-xl font-semibold tnum"
                  style={{ color: st === 'danger' ? '#D92D20' : st === 'warn' ? '#B7791F' : 'var(--text-primary)' }}
                >
                  {v.toFixed(valueDp(tag.unit))}
                </span>
                <span className="text-2xs text-txt-muted">{unitLabel(tag.unit)}</span>
                {spVal !== null && (
                  <span className="ml-auto text-2xs text-txt-muted">SP {spVal.toFixed(valueDp(tag.unit))}</span>
                )}
              </div>

              {(tag.lsl !== undefined || tag.usl !== undefined) && (
                <div className="mt-1.5 flex items-center gap-1.5 text-2xs text-txt-muted">
                  <span>
                    {tag.lsl !== undefined ? `LSL ${tag.lsl}` : ''}
                    {tag.lsl !== undefined && tag.usl !== undefined ? ' - ' : ''}
                    {tag.usl !== undefined ? `USL ${tag.usl}` : ''} {unitLabel(tag.unit)}
                  </span>
                  {isObx ? <ObxLimitTag /> : tag.demoLimit ? <DemoLimitTag /> : null}
                </div>
              )}

              {tag.target !== undefined && (
                <div className="mt-0.5 text-2xs text-txt-muted">Target {withUnit(tag.target, tag.unit)}</div>
              )}

              <div className="mt-2 border-t border-line pt-1.5">
                <DataStateBadge state={tag.dataStateToday} />
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-2xs text-txt-muted">
        Every tile shows where the number came from and what it looks like at OBX today.
        Tags marked DS3 are displayed on a local instrument but not retained; DS4 are not measured at all and would need
        new instrumentation. Nothing here writes back to a controller.
      </p>
    </div>
  );
}
