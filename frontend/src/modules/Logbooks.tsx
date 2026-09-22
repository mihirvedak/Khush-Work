import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ClipboardList, AlertTriangle, Lock } from 'lucide-react';
import { useStore, useRange, DS } from '../store/useStore';
import { FORMS, formByNo } from '../data/index';
import { selectLogbookEntries, escalationMetrics, entryStatus } from '../lib/selectors';
import { fmtTs, fmtTsMin, fmtTime, dayKey, startOfShift, HOUR, MIN } from '../lib/time';
import { pct, dash } from '../lib/format';
import { Card, CardHeader, Banner, DemoLimitTag } from '../components/primitives';
import { KpiTile, KpiStrip } from '../components/KpiTile';
import { DataTable, col } from '../components/DataTable';
import { FormEntryDrawer } from './logbooks/FormEntryDrawer';
import { EscalationStepper } from '../components/Signature';
import type { LogbookEntry } from '../data/types';

type Row = LogbookEntry & { uiStatus: LogbookEntry['status'] };

const STATUS_STYLE: Record<string, { fg: string; bg: string }> = {
  Due:       { fg: '#0F43C4', bg: '#EEF3FF' },
  Overdue:   { fg: '#B42318', bg: '#FDECEC' },
  Submitted: { fg: '#B7791F', bg: '#FDF3D8' },
  Reviewed:  { fg: '#C2410C', bg: '#FFEDD5' },
  Approved:  { fg: '#0F5132', bg: 'rgba(30,158,90,.14)' },
  Returned:  { fg: '#6E56CF', bg: 'rgba(110,86,207,.12)' },
};

export function StatusChip({ s }: { s: string }) {
  const st = STATUS_STYLE[s] ?? STATUS_STYLE.Due;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold" style={{ background: st.bg, color: st.fg }}>
      {s === 'Approved' && <Lock size={9} aria-hidden />}
      {s}
    </span>
  );
}

const TABS = [
  { id: 'tasks', label: 'My tasks' },
  { id: 'shift', label: 'Shift view' },
  { id: 'day', label: 'Day view' },
  { id: 'batch', label: 'Batch view' },
  { id: 'library', label: 'Form library' },
  { id: 'escalations', label: 'Escalations' },
] as const;

export function Logbooks() {
  const { line, assetIds, shift, overlay, now, role } = useStore();
  const range = useRange();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number]['id']) ?? 'tasks';
  const setTab = (t: string) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }); };

  const [open, setOpen] = useState<Row | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );

  const entries = useMemo(
    () => selectLogbookEntries(DS, { assetIds: assets.map((a) => a.id), from: range.from, to: range.to, shift, formNo: formFilter ?? undefined }, overlay, now),
    [assets, range.from, range.to, shift, formFilter, overlay, now],
  );

  const overdue = entries.filter((e) => e.uiStatus === 'Overdue');
  const pendingReview = entries.filter((e) => e.uiStatus === 'Submitted');
  const pendingApproval = entries.filter((e) => e.uiStatus === 'Reviewed');
  const approved = entries.filter((e) => e.uiStatus === 'Approved');
  const completion = entries.length ? (entries.length - entries.filter((e) => e.uiStatus === 'Due' || e.uiStatus === 'Overdue').length) / entries.length : 1;

  const esc = escalationMetrics(DS.escalations, overlay);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-title font-bold">Digital Logbooks</h1>
        <p className="lbl mt-0.5">
          Hybrid electronic batch records: equipment values auto-populate, operator judgement stays manual,
          Quality controls the template, the audit trail and the signatures.
        </p>
      </header>

      {overdue.length > 0 && (
        <Banner tone="danger" icon={<AlertTriangle size={16} />}>
          <b>{overdue.length} overdue {overdue.length === 1 ? 'entry' : 'entries'}</b> &mdash; the oldest is{' '}
          {dash(overdue[overdue.length - 1]?.formNo)} on {dash(overdue[overdue.length - 1]?.assetId)},
          due {overdue[overdue.length - 1] ? fmtTsMin(overdue[overdue.length - 1].dueAt) : ''} ET.
          Escalates to the shift supervisor 30 minutes after due.
        </Banner>
      )}

      <KpiStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Entries in window" value={entries.length} />
        <KpiTile label="Completion" value={pct(completion)} tone={completion > 0.95 ? 'ok' : completion > 0.85 ? 'warn' : 'danger'} />
        <KpiTile label="Overdue" value={overdue.length} tone={overdue.length ? 'danger' : 'default'} />
        <KpiTile label="Review pending" value={pendingReview.length} tone={pendingReview.length ? 'warn' : 'default'} />
        <KpiTile label="Approval pending" value={pendingApproval.length} tone={pendingApproval.length ? 'warn' : 'default'} />
        <KpiTile label="Approved & locked" value={approved.length} tone="ok" />
      </KpiStrip>

      <Card>
        <nav className="flex flex-wrap gap-1 border-b border-line px-3 pt-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'rounded-t px-3 py-2 text-xs font-medium',
                tab === t.id ? 'border-b-2 border-azure-600 text-azure-600' : 'text-txt-secondary hover:text-txt-primary',
              )}
            >
              {t.label}
              {t.id === 'escalations' && esc.open > 0 && (
                <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[9px] font-bold text-white">{esc.open}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4">
          {tab === 'tasks' && <TasksTab entries={entries} role={role} onOpen={setOpen} now={now} />}
          {tab === 'shift' && <ShiftGrid entries={entries} assets={assets.map((a) => a.id)} now={now} onOpen={setOpen} />}
          {tab === 'day' && <DayView entries={entries} onFilterForm={setFormFilter} />}
          {tab === 'batch' && <BatchView entries={entries} onOpen={setOpen} />}
          {tab === 'library' && <FormLibrary onPick={(f) => { setFormFilter(f); setTab('tasks'); }} />}
          {tab === 'escalations' && <Escalations />}
        </div>
      </Card>

      {tab !== 'library' && tab !== 'escalations' && (
        <Card>
          <CardHeader
            title="All entries"
            subtitle={formFilter ? `Filtered to ${formFilter}` : `${entries.length} entries in ${range.label}`}
            right={formFilter && (
              <button type="button" onClick={() => setFormFilter(null)} className="rounded-ctl border border-line px-2 py-1 text-xs text-txt-secondary hover:bg-subtle">
                Clear form filter
              </button>
            )}
          />
          <EntryTable entries={entries} onOpen={setOpen} />
        </Card>
      )}

      {open && <FormEntryDrawer entry={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EntryTable({ entries, onOpen }: { entries: Row[]; onOpen: (r: Row) => void }) {
  const columns = useMemo(() => [
    col<Row>('id', 'Entry', (r) => <span className="mono">{r.id}</span>, { sortFn: (r) => r.id, size: 110 }),
    col<Row>('form', 'Form', (r) => (
      <span className="inline-flex items-center gap-1">
        <span className="mono">{r.formNo}</span>
        {formByNo(r.formNo)?.demo && <DemoLimitTag />}
      </span>
    ), { sortFn: (r) => r.formNo, size: 160 }),
    col<Row>('title', 'Title', (r) => formByNo(r.formNo)?.title ?? '-', { size: 200 }),
    col<Row>('rev', 'Revision', (r) => formByNo(r.formNo)?.revision ?? '-', { size: 110 }),
    col<Row>('asset', 'Asset', (r) => <span className="mono">{r.assetId}</span>, { sortFn: (r) => r.assetId, size: 130 }),
    col<Row>('batch', 'Batch', (r) => (r.batchId ? <span className="mono">{r.batchId}</span> : '-'), { size: 170 }),
    col<Row>('shift', 'Shift', (r) => r.shift, { size: 60 }),
    col<Row>('due', 'Due (ET)', (r) => <span className="mono">{fmtTsMin(r.dueAt)}</span>, { sortFn: (r) => r.dueAt, size: 150 }),
    col<Row>('sub', 'Submitted (ET)', (r) => (r.submittedAt ? <span className="mono">{fmtTsMin(r.submittedAt)}</span> : '-'), { sortFn: (r) => r.submittedAt ?? 0, size: 150 }),
    col<Row>('status', 'Status', (r) => <StatusChip s={r.uiStatus} />, { sortFn: (r) => r.uiStatus, size: 130 }),
    col<Row>('op', 'Operator', (r) => dash(r.operator), { size: 120 }),
    col<Row>('rev2', 'Reviewer', (r) => dash(r.reviewer), { size: 120 }),
    col<Row>('app', 'Approver', (r) => dash(r.approver), { size: 130 }),
    col<Row>('oo', 'Out of limit', (r) => {
      const n = r.fields.filter((f) => f.outOfLimit).length;
      return n ? <span className="rounded bg-danger-bg px-1.5 py-0.5 text-2xs font-semibold text-danger">{n}</span> : '-';
    }, { size: 110 }),
    col<Row>('corr', 'Corrections', (r) => (r.corrections.length ? String(r.corrections.length) : '-'), { size: 110 }),
  ], []);

  return (
    <DataTable
      data={entries}
      columns={columns}
      getRowId={(r) => r.id}
      onRowClick={onOpen}
      height={400}
      exportName="obx-logbook-entries"
      searchPlaceholder="Search form, asset, batch"
      emptyTitle="No logbook entries in this window"
      emptyHint="Widen the date range or clear filters."
      rowClassName={(r) => (r.uiStatus === 'Overdue' ? 'bg-danger-bg/40' : r.fields.some((f) => f.outOfLimit) ? 'bg-warn-bg/30' : undefined)}
    />
  );
}

/** My tasks: what this role owes right now (ref 06.1). */
function TasksTab({ entries, role, onOpen, now }: { entries: Row[]; role: string; onOpen: (r: Row) => void; now: number }) {
  const mine = useMemo(() => {
    if (role === 'QA') return entries.filter((e) => e.uiStatus === 'Reviewed');
    if (role === 'Shift Supervisor') return entries.filter((e) => e.uiStatus === 'Submitted' || e.uiStatus === 'Overdue');
    return entries.filter((e) => e.uiStatus === 'Due' || e.uiStatus === 'Overdue');
  }, [entries, role]);

  if (!mine.length) {
    return <p className="text-sm text-txt-secondary">Nothing waiting on {role} in this window.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {mine.slice(0, 24).map((e) => {
        const f = formByNo(e.formNo);
        const late = e.dueAt < now;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onOpen(e)}
            className="card px-3 py-2.5 text-left hover:border-azure-200"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="mono text-xs font-semibold">{e.formNo}</div>
                <div className="truncate text-2xs text-txt-muted">{f?.title}</div>
              </div>
              <StatusChip s={e.uiStatus} />
            </div>
            <div className="mt-2 text-xs text-txt-secondary">
              <span className="mono">{e.assetId}</span>
              {e.batchId && <span className="mono ml-1.5 text-txt-muted">{e.batchId}</span>}
            </div>
            <div className={clsx('mt-1 text-2xs', late ? 'font-semibold text-danger' : 'text-txt-muted')}>
              Due {fmtTsMin(e.dueAt)} ET
              {late ? ` · ${Math.round((now - e.dueAt) / MIN)} min late` : ` · in ${Math.round((e.dueAt - now) / MIN)} min`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Shift grid: assets x 2-hour slots, cell = entry status (ref 06.1). */
function ShiftGrid({ entries, assets, now, onOpen }: { entries: Row[]; assets: string[]; now: number; onOpen: (r: Row) => void }) {
  const shiftStart = startOfShift(now);
  const slots = Array.from({ length: 6 }, (_, i) => shiftStart + i * 2 * HOUR);

  const rows = assets.filter((a) => entries.some((e) => e.assetId === a));

  if (!rows.length) return <p className="text-sm text-txt-secondary">No scheduled entries for these assets in the current shift.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-semibold text-txt-secondary">Asset</th>
            {slots.map((s) => (
              <th key={s} className="px-2 py-1.5 text-center font-semibold text-txt-secondary">{fmtTime(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a} className="border-t border-line">
              <td className="sticky left-0 z-10 mono bg-surface px-2 py-1.5">{a}</td>
              {slots.map((s) => {
                const hit = entries.find((e) => e.assetId === a && e.dueAt >= s && e.dueAt < s + 2 * HOUR);
                if (!hit) return <td key={s} className="px-2 py-1.5 text-center text-txt-muted">&ndash;</td>;
                return (
                  <td key={s} className="px-1 py-1 text-center">
                    <button type="button" onClick={() => onOpen(hit)} className="w-full">
                      <StatusChip s={hit.uiStatus} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-2xs text-txt-muted">
        Six two-hour slots for the current shift. A dash means no entry is scheduled for that asset in that slot.
      </p>
    </div>
  );
}

/** Day view: completion per form per line. */
function DayView({ entries, onFilterForm }: { entries: Row[]; onFilterForm: (f: string) => void }) {
  const byForm = useMemo(() => {
    const acc = new Map<string, { total: number; done: number; overdue: number; review: number }>();
    for (const e of entries) {
      const cur = acc.get(e.formNo) ?? { total: 0, done: 0, overdue: 0, review: 0 };
      cur.total += 1;
      if (e.uiStatus === 'Approved' || e.uiStatus === 'Reviewed' || e.uiStatus === 'Submitted') cur.done += 1;
      if (e.uiStatus === 'Overdue') cur.overdue += 1;
      if (e.uiStatus === 'Submitted' || e.uiStatus === 'Reviewed') cur.review += 1;
      acc.set(e.formNo, cur);
    }
    return [...acc.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [entries]);

  if (!byForm.length) return <p className="text-sm text-txt-secondary">No entries in this window.</p>;

  return (
    <div className="space-y-2">
      {byForm.map(([formNo, v]) => {
        const f = formByNo(formNo);
        const pctDone = v.total ? v.done / v.total : 0;
        return (
          <button
            key={formNo}
            type="button"
            onClick={() => onFilterForm(formNo)}
            className="flex w-full items-center gap-3 rounded-ctl border border-line px-3 py-2 text-left hover:bg-subtle"
          >
            <div className="w-40 shrink-0">
              <div className="mono text-xs font-semibold">{formNo}</div>
              <div className="truncate text-2xs text-txt-muted">{f?.title}</div>
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-ok" style={{ width: `${pctDone * 100}%` }} />
            </div>
            <div className="w-16 shrink-0 text-right text-xs tnum">{pct(pctDone, 0)}</div>
            <div className="w-24 shrink-0 text-right text-2xs">
              {v.overdue > 0 && <span className="rounded bg-danger-bg px-1.5 py-0.5 font-semibold text-danger">{v.overdue} overdue</span>}
            </div>
            <div className="w-20 shrink-0 text-right text-2xs text-txt-muted">{v.total} entries</div>
          </button>
        );
      })}
    </div>
  );
}

function BatchView({ entries, onOpen }: { entries: Row[]; onOpen: (r: Row) => void }) {
  const byBatch = useMemo(() => {
    const acc = new Map<string, Row[]>();
    for (const e of entries) {
      if (!e.batchId) continue;
      acc.set(e.batchId, [...(acc.get(e.batchId) ?? []), e]);
    }
    return [...acc.entries()].sort((a, b) => (b[1][0]?.dueAt ?? 0) - (a[1][0]?.dueAt ?? 0)).slice(0, 30);
  }, [entries]);

  if (!byBatch.length) return <p className="text-sm text-txt-secondary">No batch-linked entries in this window.</p>;

  return (
    <div className="space-y-2">
      {byBatch.map(([batch, list]) => {
        const done = list.filter((e) => e.uiStatus === 'Approved').length;
        return (
          <div key={batch} className="rounded-ctl border border-line px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-xs font-semibold">{batch}</span>
              <span className="text-2xs text-txt-muted">{done} of {list.length} approved</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {list.map((e) => (
                <button key={e.id} type="button" onClick={() => onOpen(e)} title={`${e.formNo} ${fmtTsMin(e.dueAt)}`}>
                  <StatusChip s={e.uiStatus} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Form library - the controlled templates, with revision and effective date. */
function FormLibrary({ onPick }: { onPick: (formNo: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {FORMS.map((f) => (
        <button key={f.formNo} type="button" onClick={() => onPick(f.formNo)} className="card px-3 py-3 text-left hover:border-azure-200">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mono text-xs font-semibold">{f.formNo}</div>
              <div className="text-sm font-medium text-txt-primary">{f.title}</div>
            </div>
            {f.demo ? <DemoLimitTag /> : <span className="rounded bg-[rgba(15,118,110,.12)] px-1 py-px text-2xs font-semibold text-[#0F766E]">OBX</span>}
          </div>
          <dl className="mt-2 space-y-0.5 text-2xs text-txt-muted">
            <div className="flex justify-between"><dt>Revision</dt><dd className="text-txt-secondary">{f.revision}</dd></div>
            <div className="flex justify-between"><dt>Effective</dt><dd className="text-txt-secondary">{f.effective}</dd></div>
            <div className="flex justify-between"><dt>Level</dt><dd className="text-txt-secondary">{f.level}{f.everyH ? ` · every ${f.everyH} h` : ''}</dd></div>
            <div className="flex justify-between"><dt>Sections</dt><dd className="text-txt-secondary">{f.sections.length}</dd></div>
            <div className="flex justify-between"><dt>Fields</dt><dd className="text-txt-secondary">{f.sections.reduce((s, x) => s + x.fields.length, 0)}</dd></div>
          </dl>
          <p className="mt-2 line-clamp-2 text-2xs text-txt-muted">{f.purpose}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {f.signoff.map((s) => (
              <span key={s.step} className="rounded border border-line px-1.5 py-px text-[9px] text-txt-secondary">
                {s.step} &middot; {s.role}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Escalation matrix + live escalation metrics (ref 06). */
function Escalations() {
  const { overlay, ackEscalation, now } = useStore();
  const m = escalationMetrics(DS.escalations, overlay);

  const open = useMemo(
    () => DS.escalations
      .filter((e) => !(e.ackAt ?? overlay.ackEscalations[e.id]?.at))
      .sort((a, b) => b.levelReached - a.levelReached || b.startedAt - a.startedAt)
      .slice(0, 40),
    [overlay],
  );

  const MATRIX = [
    ['Unplanned stop on a constraint asset (WFE-2M, CRY-01/02)', 'Operator', 'Supervisor @ 30 min', 'Production Mgr @ 2 h', 'Plant Head @ 8 h'],
    ['Unplanned stop, non-constraint', 'Operator', 'Supervisor @ 60 min', 'Production Mgr @ 4 h', '-'],
    ['Untagged downtime at shift end', 'Operator', 'Supervisor @ +30 min', '-', '-'],
    ['Critical deviation', 'Operator + Supervisor + QA', 'Production Mgr @ 15 min', 'Plant Head @ 1 h', '-'],
    ['Major deviation', 'Operator', 'Supervisor @ 15 min', 'QA @ 1 h', 'Production Mgr @ 4 h'],
    ['Minor deviation / tunnel exit', 'Operator', 'Supervisor @ 60 min', '-', '-'],
    ['Logbook entry overdue (2-h check)', 'Operator @ +10 min', 'Supervisor @ +30 min', 'Production Mgr @ +2 h', '-'],
    ['Daily checklist not done', 'Operator @ shift end', 'Supervisor @ +1 h', 'Production Mgr @ +24 h', '-'],
    ['Batch record review pending', 'Supervisor @ close + 4 h', 'QA @ +24 h', 'Production Mgr @ +72 h', '-'],
    ['Quality HOLD for D9 THC / 7-OH, any SCRAP', 'QA + Plant Head', '-', '-', '-'],
    ['Edge disconnected (DISC) > 10 min', 'OBX IT/OT + Faclon support', 'Supervisor @ 30 min', '-', '-'],
    ['Heptane loss above target for a lot', 'Production Mgr on lot close', 'Plant Head weekly digest', '-', '-'],
  ];

  return (
    <div className="space-y-4">
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <KpiTile label="Open escalations" value={m.open} tone={m.open ? 'warn' : 'default'} />
        <KpiTile label="At L3 / L4" value={m.byLevel[3] + m.byLevel[4]} tone={m.byLevel[3] + m.byLevel[4] ? 'danger' : 'default'} />
        <KpiTile label="SLA adherence" value={pct(m.slaAdherence)} tone={m.slaAdherence > 0.9 ? 'ok' : 'warn'} />
        <KpiTile label="Mean time to acknowledge" value={Math.round(m.meanAckMs / MIN)} unit="min" />
      </KpiStrip>

      <div>
        <h3 className="card-title mb-2">Open escalations</h3>
        {open.length === 0 ? (
          <p className="text-sm text-txt-secondary">Nothing open.</p>
        ) : (
          <ul className="space-y-2">
            {open.map((e) => (
              <li key={e.id} className="rounded-ctl border border-line px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="mono text-xs font-semibold">{e.id}</span>
                    <span className="ml-2 text-xs text-txt-secondary">{e.trigger}</span>
                    <span className="mono ml-2 text-2xs text-txt-muted">{e.entityId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-txt-muted">started {fmtTs(e.startedAt)}</span>
                    <button
                      type="button"
                      onClick={() => ackEscalation(e.id)}
                      className="rounded-ctl bg-azure-600 px-2.5 py-1 text-2xs font-semibold text-white"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <EscalationStepper level={e.levelReached} />
                </div>
                <p className="mt-1 text-2xs text-txt-muted">
                  Notified: {e.notified.join(', ') || '-'} &middot; SLA {e.slaMet ? 'met' : 'missed'} &middot; open {Math.round((now - e.startedAt) / MIN)} min
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="card-title mb-2">Escalation matrix</h3>
        <p className="lbl mb-2">Configurable per trigger in Settings. Channels: in-app, email, SMS; Slack for notification only.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-subtle">
              <tr>
                {['Trigger', 'L1 (T+0)', 'L2', 'L3', 'L4'].map((h) => (
                  <th key={h} className="border-b border-line px-2 py-1.5 text-left font-semibold text-txt-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((r, i) => (
                <tr key={r[0]} className={i % 2 ? 'bg-subtle/40' : ''}>
                  {r.map((c, j) => (
                    <td key={j} className={clsx('border-b border-line px-2 py-1.5', j === 0 && 'font-medium text-txt-primary')}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export { ClipboardList, dayKey, entryStatus };
