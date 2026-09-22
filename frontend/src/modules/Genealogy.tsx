import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { GitBranch, Search, ArrowRight, FlaskConical, ClipboardList, OctagonAlert } from 'lucide-react';
import { useStore, DS } from '../store/useStore';
import { ancestorsOf, descendantsOf, batchById } from '../lib/selectors';
import { fmtTs, fmtDuration } from '../lib/time';
import { num, pctRaw, dash } from '../lib/format';
import { Card, CardHeader, IdLink, SourceBadge, SeverityChip, EmptyState } from '../components/primitives';
import { Stat } from '../components/KpiTile';
import { DataTable, col } from '../components/DataTable';
import type { Batch } from '../data/types';

export function Genealogy() {
  const { search, now } = useStore();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('batch') ?? search ?? '');

  useEffect(() => {
    const b = params.get('batch');
    if (b) setQuery(b);
  }, [params]);

  const selected = useMemo(() => (query ? batchById(DS, query.trim()) : undefined), [query]);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q || selected) return [];
    return DS.batches.filter((b) => b.id.toUpperCase().includes(q)).slice(0, 30);
  }, [query, selected]);

  const recent = useMemo(
    () => DS.batches.filter((b) => b.end !== null).sort((a, b) => (b.end ?? 0) - (a.end ?? 0)).slice(0, 12),
    [],
  );

  const pick = (id: string) => {
    setQuery(id);
    const n = new URLSearchParams(params);
    n.set('batch', id);
    setParams(n, { replace: true });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-title font-bold">Batch Genealogy</h1>
        <p className="lbl mt-0.5">
          Reconstruct any released batch end-to-end &mdash; material lineage, equipment conditions, operator actions
          and quality results, in under two minutes.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Find a batch"
          subtitle="Search any OBX identity: crystallization batch, WFE campaign, isolation crash, D8 reaction, drum or salt run"
        />
        <div className="p-4">
          <label className="relative block max-w-xl">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. ISO-C-260921-02-C1, MCB-26-0160, 2M-260920-01"
              className="w-full rounded-ctl border border-line bg-subtle py-2 pl-8 pr-3 text-sm"
              aria-label="Search batch"
            />
          </label>

          {!selected && (
            <div className="mt-3">
              <p className="lbl mb-1.5">{matches.length ? 'Matches' : 'Recently completed batches'}</p>
              <div className="flex flex-wrap gap-1.5">
                {(matches.length ? matches : recent).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pick(b.id)}
                    className="mono rounded-ctl border border-line px-2 py-1 text-2xs hover:bg-subtle"
                    title={`${b.assetId} · ${b.product}`}
                  >
                    {b.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {selected ? <BatchDetail batch={selected} now={now} onPick={pick} /> : (
        <Card>
          <EmptyState title="Select a batch to reconstruct it" hint="Pick one above, or follow a batch ID from any other screen." />
        </Card>
      )}
    </div>
  );
}

function BatchDetail({ batch, now, onPick }: { batch: Batch; now: number; onPick: (id: string) => void }) {
  const ancestors = useMemo(() => ancestorsOf(DS, batch.id), [batch.id]);
  const children = useMemo(() => descendantsOf(DS, batch.id), [batch.id]);
  const asset = DS.assets.find((a) => a.id === batch.assetId);

  const events = useMemo(
    () => DS.events.filter((e) => e.batchId === batch.id).sort((a, b) => a.start - b.start),
    [batch.id],
  );
  const logs = useMemo(() => DS.logbookEntries.filter((l) => l.batchId === batch.id), [batch.id]);
  const devs = useMemo(() => DS.deviations.filter((d) => d.batchId === batch.id), [batch.id]);
  const losses = useMemo(() => DS.qualityLosses.filter((q) => q.batchId === batch.id), [batch.id]);

  const downtime = events.filter((e) => e.state === 'DOWN' || e.state === 'IDLE' || e.state === 'HOLD')
    .reduce((s, e) => s + ((e.end ?? now) - e.start), 0);

  const eventCols = useMemo(() => [
    col<typeof events[number]>('start', 'Start (ET)', (r) => <span className="mono">{fmtTs(r.start)}</span>, { sortFn: (r) => r.start, size: 160 }),
    col<typeof events[number]>('state', 'State', (r) => r.state, { size: 90 }),
    col<typeof events[number]>('phase', 'Phase', (r) => dash(r.phase), { size: 130 }),
    col<typeof events[number]>('dur', 'Duration', (r) => <span className="mono">{fmtDuration((r.end ?? now) - r.start)}</span>, { size: 110 }),
    col<typeof events[number]>('reason', 'Reason', (r) => (r.reasonCode ? `${r.reasonCode} ${DS.reasons.find((x) => x.code === r.reasonCode)?.label ?? ''}` : '-'), { size: 260 }),
  ], [now]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<span className="mono">{batch.id}</span> as unknown as string}
          subtitle={`${batch.product} · ${batch.assetId} ${asset ? `(${asset.name})` : ''}`}
          right={
            <>
              <Stat label="Input" value={`${num(batch.inputKg, 1)} kg`} />
              <Stat label="Output" value={`${num(batch.outputKg, 1)} kg`} />
              <Stat label="Yield" value={batch.theoreticalKg ? pctRaw(((batch.outputKg ?? 0) / batch.theoreticalKg) * 100) : '-'} />
              <Stat label="First pass" value={batch.firstPass === null ? '-' : batch.firstPass ? 'Yes' : 'No'} tone={batch.firstPass === false ? 'warn' : 'ok'} />
            </>
          }
        />

        {/* lineage chain */}
        <div className="border-b border-line p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-muted">
            <GitBranch size={12} /> Material lineage
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {ancestors.length === 0 && <span className="text-xs text-txt-muted">No upstream parents recorded (line start).</span>}
            {ancestors.slice().reverse().map((a) => (
              <span key={a.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPick(a.id)}
                  className="rounded-ctl border border-line px-2 py-1 text-left hover:bg-subtle"
                >
                  <span className="mono block text-2xs font-semibold text-azure-600">{a.id}</span>
                  <span className="block text-[10px] text-txt-muted">{a.assetId} &middot; {num(a.outputKg, 1)} kg</span>
                </button>
                <ArrowRight size={12} className="text-txt-muted" aria-hidden />
              </span>
            ))}
            <span className="rounded-ctl border-2 border-azure-600 bg-azure-50 px-2 py-1">
              <span className="mono block text-2xs font-semibold">{batch.id}</span>
              <span className="block text-[10px] text-txt-muted">{batch.assetId} &middot; {num(batch.outputKg, 1)} kg</span>
            </span>
            {children.map((c) => (
              <span key={c.id} className="flex items-center gap-2">
                <ArrowRight size={12} className="text-txt-muted" aria-hidden />
                <button
                  type="button"
                  onClick={() => onPick(c.id)}
                  className="rounded-ctl border border-line px-2 py-1 text-left hover:bg-subtle"
                >
                  <span className="mono block text-2xs font-semibold text-azure-600">{c.id}</span>
                  <span className="block text-[10px] text-txt-muted">{c.assetId} &middot; {num(c.outputKg, 1)} kg</span>
                </button>
              </span>
            ))}
          </div>
          <p className="mt-2 text-2xs text-txt-muted">
            Faclon never mints a parallel batch identity &mdash; these are OBX&rsquo;s own IDs, read from the existing
            genealogy (L1) or created inside the Quality-controlled eBPR (L2).
          </p>
        </div>

        {/* phases */}
        <div className="border-b border-line p-4">
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-txt-muted">Phases (ISA-88)</h3>
          <div className="space-y-1">
            {batch.phases.map((p) => {
              const actual = ((p.end ?? now) - p.start) / 3_600_000;
              const over = actual > p.idealH * 1.15;
              return (
                <div key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-36 shrink-0 truncate text-txt-secondary">{p.name}</span>
                  <span className="relative h-3 flex-1 overflow-hidden rounded bg-subtle">
                    <span className="absolute inset-y-0 left-0 rounded bg-[rgba(122,136,154,.35)]" style={{ width: `${Math.min(100, (p.idealH / Math.max(actual, p.idealH)) * 100)}%` }} title={`ideal ${p.idealH.toFixed(1)} h`} />
                    <span className={clsx('absolute inset-y-0 left-0 h-1.5 translate-y-[3px] rounded', over ? 'bg-danger' : 'bg-ok')} style={{ width: `${Math.min(100, (actual / Math.max(actual, p.idealH)) * 100)}%` }} />
                  </span>
                  <span className="mono w-28 shrink-0 text-right text-txt-secondary">
                    {actual.toFixed(1)} h / {p.idealH.toFixed(1)} h
                  </span>
                  {over && <span className="rounded bg-danger-bg px-1 text-[10px] font-semibold text-danger">over</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <Summary
            icon={<OctagonAlert size={13} className="text-danger" />}
            title="Downtime during this batch"
            value={fmtDuration(downtime)}
            detail={`${events.filter((e) => e.state === 'DOWN').length} unplanned stop(s)`}
          />
          <Summary
            icon={<ClipboardList size={13} className="text-azure-600" />}
            title="Logbook records"
            value={String(logs.length)}
            detail={`${logs.filter((l) => l.status === 'Approved').length} approved and locked`}
          />
          <Summary
            icon={<FlaskConical size={13} className="text-warn" />}
            title="Quality"
            value={losses.length ? `${num(losses.reduce((s, l) => s + l.qtyKg, 0), 1)} kg affected` : 'No losses'}
            detail={devs.length ? `${devs.length} deviation(s)` : 'No deviations'}
          />
        </div>
      </Card>

      {devs.length > 0 && (
        <Card>
          <CardHeader title="Deviations on this batch" />
          <ul className="space-y-1 p-3">
            {devs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-ctl border border-line px-2.5 py-1.5 text-xs">
                <span className="mono">{d.id}</span>
                <span className="min-w-0 flex-1 truncate text-txt-secondary">
                  {d.tagKey} &middot; {d.limitType} limit {num(d.limit, 2)}, worst {num(d.worst, 2)}
                </span>
                <SeverityChip severity={d.severity} />
                <span className="text-2xs text-txt-muted">{d.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader title="Records" subtitle="Every controlled record attached to this batch" />
          <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {logs.map((l) => (
              <li key={l.id} className="rounded-ctl border border-line px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-2xs font-semibold">{l.formNo}</span>
                  <span className="text-2xs text-txt-muted">{l.status}</span>
                </div>
                <div className="mt-0.5 text-2xs text-txt-muted">
                  {l.operator ? `Performed ${l.operator}` : 'Not yet performed'}
                  {l.approver ? ` · approved ${l.approver}` : ''}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <SourceBadge source="Controller" />
                  <span className="text-[10px] text-txt-muted">
                    {l.fields.filter((f) => f.source !== 'Manual').length} of {l.fields.length} auto
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Equipment history during this batch" subtitle={`${events.length} state events`} />
        <DataTable
          data={events}
          columns={eventCols}
          getRowId={(r) => r.id}
          height={260}
          exportName={`obx-genealogy-${batch.id}`}
          searchable={false}
          emptyTitle="No equipment events recorded"
        />
      </Card>
    </div>
  );
}

function Summary({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <div className="rounded-ctl border border-line px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-muted">
        {icon}{title}
      </div>
      <div className="mt-1 text-lg font-semibold tnum">{value}</div>
      <div className="text-2xs text-txt-muted">{detail}</div>
    </div>
  );
}

export { IdLink };
