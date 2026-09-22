import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Plus, Save, X, OctagonAlert, FlaskConical, ClipboardList, BarChart3 } from 'lucide-react';
import { Downtime } from './Downtime';
import { QualityLoss } from './QualityLoss';
import { useStore, DS, type ManualDowntime, type ManualRejection } from '../store/useStore';
import { selectEvents, selectQualityLosses } from '../lib/selectors';
import { useRange } from '../store/useStore';
import { fmtTs, fmtTsMin, fmtDuration, shiftAt, TZ } from '../lib/time';
import { num, dash } from '../lib/format';
import { isUnplanned } from '../lib/states';
import { Card, StateChip, CategoryChip } from '../components/primitives';
import { KpiTile, KpiStrip } from '../components/KpiTile';
import { DataTable, col } from '../components/DataTable';
import { formatInTimeZone } from 'date-fns-tz';
import type { LineId, Disposition } from '../data/types';

const TABS = [
  { id: 'downtime', label: 'Downtime Entries', icon: OctagonAlert },
  { id: 'downtime-analysis', label: 'Downtime Analysis', icon: BarChart3 },
  { id: 'rejection', label: 'Rejection Entries', icon: FlaskConical },
  { id: 'rejection-analysis', label: 'Rejection Analysis', icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]['id'];

const QL_REASONS = DS.qualityLosses.reduce((acc, q) => {
  if (!acc.some((x) => x.code === q.reasonCode)) acc.push({ code: q.reasonCode, label: q.reasonLabel, line: q.line });
  return acc;
}, [] as { code: string; label: string; line: LineId }[]).sort((a, b) => a.code.localeCompare(b.code));

const DISPOSITIONS: Disposition[] = ['HOLD', 'REWORK', 'DOWNGRADE', 'SCRAP'];

/** Local datetime value for an <input type="datetime-local"> in plant time. */
const toLocalInput = (t: number) => formatInTimeZone(t, TZ, "yyyy-MM-dd'T'HH:mm");
const fromLocalInput = (v: string, near: number) => {
  const offset = formatInTimeZone(near, TZ, 'xxx');
  const t = new Date(`${v}:00${offset}`).getTime();
  return Number.isFinite(t) ? t : near;
};

export function DataLogger() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'downtime';
  const setTab = (t: TabId) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }); };
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-title font-bold">Data Logger</h1>
          <p className="lbl mt-0.5">
            Manual shop-floor entry for the events the system cannot detect on its own.
            Auto-detected events appear here too, so the shift has a single record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setFormOpen(true); if (tab.endsWith('analysis')) setTab(tab.startsWith('downtime') ? 'downtime' : 'rejection'); }}
          className="inline-flex items-center gap-1.5 rounded-ctl bg-azure-600 px-3 py-2 text-xs font-semibold text-white hover:bg-azure-700"
        >
          <Plus size={14} /> New {tab.startsWith('downtime') ? 'downtime' : 'rejection'} entry
        </button>
      </header>

      <Card>
        <nav className="flex gap-1 border-b border-line px-3 pt-2" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => { setTab(t.id); setFormOpen(false); }}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-t px-3 py-2 text-xs font-medium',
                  tab === t.id ? 'border-b-2 border-azure-600 text-azure-600' : 'text-txt-secondary hover:text-txt-primary',
                )}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4">
          {tab === 'downtime' && <DowntimeLogger formOpen={formOpen} closeForm={() => setFormOpen(false)} />}
          {tab === 'rejection' && <RejectionLogger formOpen={formOpen} closeForm={() => setFormOpen(false)} />}
          {tab === 'downtime-analysis' && <Downtime embedded />}
          {tab === 'rejection-analysis' && <QualityLoss embedded />}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ downtime */

function DowntimeLogger({ formOpen, closeForm }: { formOpen: boolean; closeForm: () => void }) {
  const { line, assetIds, shift, overlay, now, addManualDowntime, tagEvent, user } = useStore();
  const range = useRange();

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );

  /**
   * Stops the platform detected on its own (production stopped) that nobody has
   * explained yet. These are what an operator actually works through at handover.
   */
  const untaggedDetected = useMemo(
    () => selectEvents(DS, { assetIds: assets.map((a) => a.id), from: range.from, to: range.to }, overlay, now)
      .filter((e) => isUnplanned(e.state) && e.state !== 'MICRO' && (e.reasonCode ?? 'U000') === 'U000')
      .sort((a, b) => b.start - a.start),
    [assets, range.from, range.to, overlay, now],
  );

  const auto = useMemo(
    () => selectEvents(DS, { assetIds: assets.map((a) => a.id), from: range.from, to: range.to, shift }, overlay, now)
      .filter((e) => isUnplanned(e.state) && e.state !== 'MICRO')
      .map((e) => ({
        id: e.id.replace(/^EV-/, 'DT-'),
        assetId: e.assetId,
        start: e.start,
        end: e.end,
        durationMs: e.durationMs,
        reasonCode: e.reasonCode ?? 'U000',
        shift: shiftAt(e.start),
        source: 'Auto-detected' as const,
        remarks: e.remarks ?? '',
        loggedBy: e.taggedBy ?? '',
      })),
    [assets, range.from, range.to, shift, overlay, now],
  );

  const manual = overlay.manualDowntime.map((m) => ({
    id: m.id,
    assetId: m.assetId,
    start: m.start,
    end: m.end,
    durationMs: (m.end ?? now) - m.start,
    reasonCode: m.reasonCode,
    shift: m.shift,
    source: 'Manual entry' as const,
    remarks: m.remarks ?? '',
    loggedBy: m.loggedBy,
  }));

  const rows = [...manual, ...auto].sort((a, b) => b.start - a.start);
  const totalMs = rows.reduce((s, r) => s + r.durationMs, 0);

  const columns = useMemo(() => [
    col<typeof rows[number]>('id', 'Entry ID', (r) => <span className="mono">{r.id}</span>, { sortFn: (r) => r.id, size: 140 }),
    col<typeof rows[number]>('src', 'Source', (r) => (
      <span className={clsx('rounded px-1.5 py-0.5 text-2xs font-semibold', r.source === 'Manual entry' ? 'bg-azure-50 text-azure-700' : 'bg-subtle text-txt-secondary')}>
        {r.source}
      </span>
    ), { size: 130 }),
    col<typeof rows[number]>('asset', 'Machine', (r) => <span className="mono">{r.assetId}</span>, { sortFn: (r) => r.assetId, size: 130 }),
    col<typeof rows[number]>('start', 'Start (ET)', (r) => <span className="mono">{fmtTs(r.start)}</span>, { sortFn: (r) => r.start, size: 160 }),
    col<typeof rows[number]>('end', 'End (ET)', (r) => (r.end === null ? <StateChip state="DOWN" size="sm" ongoing /> : <span className="mono">{fmtTs(r.end)}</span>), { size: 160 }),
    col<typeof rows[number]>('dur', 'Duration', (r) => <span className="mono font-semibold">{fmtDuration(r.durationMs)}</span>, { sortFn: (r) => r.durationMs, size: 110 }),
    col<typeof rows[number]>('shift', 'Shift', (r) => r.shift, { size: 60 }),
    col<typeof rows[number]>('cat', 'Category', (r) => <CategoryChip category={r.reasonCode[0]} />, { size: 170 }),
    col<typeof rows[number]>('reason', 'Reason', (r) => (
      r.reasonCode === 'U000'
        ? <span className="rounded bg-warn-bg px-1.5 py-0.5 text-2xs font-semibold text-warn">Untagged</span>
        : <span>{r.reasonCode} {DS.reasons.find((x) => x.code === r.reasonCode)?.label ?? ''}</span>
    ), { sortFn: (r) => r.reasonCode, size: 250 }),
    col<typeof rows[number]>('by', 'Logged by', (r) => dash(r.loggedBy), { size: 120 }),
    col<typeof rows[number]>('remarks', 'Remarks', (r) => dash(r.remarks), { size: 260 }),
  ], []);

  return (
    <div className="space-y-4">
      {formOpen && (
        <DowntimeForm
          onClose={closeForm}
          onSave={addManualDowntime}
          onTag={tagEvent}
          detected={untaggedDetected}
          now={now}
          user={user}
        />
      )}

      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <KpiTile label="Entries" value={rows.length} />
        <KpiTile label="Manual entries" value={manual.length} tone={manual.length ? 'ok' : 'default'} />
        <KpiTile label="Total downtime" value={fmtDuration(totalMs)} tone="danger" />
        <KpiTile
          label="Detected, awaiting reason"
          value={untaggedDetected.length}
          tone={untaggedDetected.length ? 'warn' : 'default'}
          hint="Stops the platform detected from machine state that still have no reason"
        />
      </KpiStrip>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        height={420}
        exportName="obx-downtime-log"
        searchPlaceholder="Search machine, reason"
        emptyTitle="No downtime entries"
        emptyHint="Log one with the button above."
        rowClassName={(r) => (r.source === 'Manual entry' ? 'bg-azure-50/40' : undefined)}
      />
    </div>
  );
}

function DowntimeForm({
  onClose, onSave, onTag, detected, now, user,
}: {
  onClose: () => void;
  onSave: (e: Omit<ManualDowntime, 'id' | 'loggedBy' | 'loggedAt' | 'shift'>) => void;
  onTag: (eventId: string, reasonCode: string, opts?: { action?: string; remarks?: string }) => void;
  detected: { id: string; assetId: string; start: number; endOr: number; durationMs: number; line: LineId; ongoing: boolean }[];
  now: number;
  user: string;
}) {
  // Detection is automatic (from machine state), attribution is human. Tagging a stop
  // the platform already found is the normal path; a fully manual entry is the exception.
  const [source, setSource] = useState<'detected' | 'manual'>(detected.length ? 'detected' : 'manual');
  const [eventId, setEventId] = useState(detected[0]?.id ?? '');
  const [assetId, setAssetId] = useState(DS.assets[0].id);
  const [start, setStart] = useState(toLocalInput(now - 3_600_000));
  const [end, setEnd] = useState(toLocalInput(now));
  const [ongoing, setOngoing] = useState(false);
  const [category, setCategory] = useState('E');
  const [reasonCode, setReasonCode] = useState('');
  const [action, setAction] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');

  const picked = detected.find((d) => d.id === eventId);
  const effectiveAssetId = source === 'detected' && picked ? picked.assetId : assetId;
  const asset = DS.assets.find((a) => a.id === effectiveAssetId)!;
  const reasons = DS.reasons.filter((r) => r.lines.includes(asset.line) && r.category === category);

  const submit = () => {
    if (!reasonCode) { setErr('Pick a reason before saving.'); return; }

    if (source === 'detected') {
      if (!picked) { setErr('Select the detected stop you are explaining.'); return; }
      onTag(picked.id, reasonCode, { action: action || undefined, remarks: remarks || undefined });
      onClose();
      return;
    }

    const s = fromLocalInput(start, now);
    const e = ongoing ? null : fromLocalInput(end, now);
    if (e !== null && e <= s) { setErr('End time must be after the start time.'); return; }
    onSave({ assetId, line: asset.line, start: s, end: e, reasonCode, action: action || undefined, remarks: remarks || undefined });
    onClose();
  };

  return (
    <FormShell title="Log a downtime event" subtitle={`Entering as ${user}`} onClose={onClose} onSubmit={submit} err={err}>
      <Field label="How was this stop found?" required>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSource('detected')}
            aria-pressed={source === 'detected'}
            disabled={!detected.length}
            className={clsx(
              'min-h-[40px] rounded-ctl border px-3 py-1.5 text-xs font-medium disabled:opacity-40',
              source === 'detected' ? 'border-azure-600 bg-azure-50 text-azure-700' : 'border-line hover:bg-subtle',
            )}
          >
            Detected automatically ({detected.length})
          </button>
          <button
            type="button"
            onClick={() => setSource('manual')}
            aria-pressed={source === 'manual'}
            className={clsx(
              'min-h-[40px] rounded-ctl border px-3 py-1.5 text-xs font-medium',
              source === 'manual' ? 'border-azure-600 bg-azure-50 text-azure-700' : 'border-line hover:bg-subtle',
            )}
          >
            Log manually
          </button>
        </div>
        <p className="mt-1 text-2xs text-txt-muted">
          The platform detects a stop whenever production stops on the timeline. You supply the reason &mdash;
          detection is automatic, attribution is human.
        </p>
      </Field>

      {source === 'detected' ? (
        <>
          <Field label="Detected stop" required>
            <select value={eventId} onChange={(e) => { setEventId(e.target.value); setReasonCode(''); setErr(''); }} className={INPUT}>
              {detected.length === 0 && <option value="">No untagged stops in this window</option>}
              {detected.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.assetId} · {fmtTs(d.start)} · {d.ongoing ? 'ongoing' : fmtDuration(d.durationMs)}
                </option>
              ))}
            </select>
          </Field>

          {picked && (
            <div className="grid grid-cols-2 gap-2 rounded-ctl border border-line bg-subtle px-3 py-2 sm:grid-cols-4">
              <ReadOnly label="Machine" value={picked.assetId} mono />
              <ReadOnly label="Start (ET)" value={fmtTs(picked.start)} mono />
              <ReadOnly label="End (ET)" value={picked.ongoing ? 'Ongoing' : fmtTs(picked.endOr)} mono />
              <ReadOnly label="Duration" value={fmtDuration(picked.durationMs)} mono />
            </div>
          )}
        </>
      ) : (
        <>
          <Row2>
            <Field label="Machine" required>
              <select value={assetId} onChange={(e) => { setAssetId(e.target.value); setReasonCode(''); }} className={INPUT}>
                {DS.assets.map((a) => <option key={a.id} value={a.id}>{a.id} - {a.name}</option>)}
              </select>
            </Field>
            <Field label="Line">
              <input value={asset.line === 'L1' ? 'L1 Kratom / MIT' : 'L2 Bulk Cannabinoids'} readOnly className={clsx(INPUT, 'bg-subtle text-txt-muted')} />
            </Field>
          </Row2>

          <Row2>
            <Field label="Start (ET)" required>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT} />
            </Field>
            <Field label="End (ET)" required={!ongoing}>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={ongoing} className={clsx(INPUT, ongoing && 'bg-subtle text-txt-muted')} />
              <label className="mt-1 inline-flex items-center gap-1.5 text-2xs text-txt-secondary">
                <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
                Still down (ongoing)
              </label>
            </Field>
          </Row2>
        </>
      )}

      <Field label="Category" required>
        <div className="flex flex-wrap gap-1.5">
          {['P', 'E', 'R', 'M', 'U', 'Q', 'H', 'X'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCategory(c); setReasonCode(''); }}
              aria-pressed={category === c}
              className={clsx(
                'min-h-[40px] rounded-ctl border px-3 py-1.5 text-xs font-medium',
                category === c ? 'border-azure-600 bg-azure-50 text-azure-700' : 'border-line hover:bg-subtle',
              )}
            >
              <CategoryChip category={c} />
            </button>
          ))}
        </div>
      </Field>

      <Field label="Reason" required>
        <select value={reasonCode} onChange={(e) => { setReasonCode(e.target.value); setErr(''); }} className={INPUT}>
          <option value="">Select a reason…</option>
          {reasons.map((r) => <option key={r.code} value={r.code}>{r.code} - {r.label}</option>)}
        </select>
      </Field>

      <Field label="Action taken">
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Changed pump oil" className={INPUT} />
      </Field>

      <Field label="Remarks">
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value.slice(0, 500))} rows={2} maxLength={500} className={INPUT} placeholder="Optional - max 500 characters" />
      </Field>
    </FormShell>
  );
}

/* ------------------------------------------------------------------ rejection */

function RejectionLogger({ formOpen, closeForm }: { formOpen: boolean; closeForm: () => void }) {
  const { line, assetIds, shift, overlay, now, addManualRejection, user } = useStore();
  const range = useRange();

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );

  const auto = useMemo(
    () => selectQualityLosses(DS, { assetIds: assets.map((a) => a.id), from: range.from, to: range.to, shift }, overlay)
      .map((q) => ({
        id: q.id, assetId: q.assetId, at: q.at, batchId: q.batchId, reasonCode: q.reasonCode,
        reasonLabel: q.reasonLabel, qtyKg: q.qtyKg, disposition: q.disposition, shift: q.shift,
        source: 'System' as const, loggedBy: q.raisedBy, remarks: q.evidence,
      })),
    [assets, range.from, range.to, shift, overlay],
  );

  const manual = overlay.manualRejection.map((m) => ({
    id: m.id, assetId: m.assetId, at: m.at, batchId: m.batchId, reasonCode: m.reasonCode,
    reasonLabel: m.reasonLabel, qtyKg: m.qtyKg, disposition: m.disposition, shift: m.shift,
    source: 'Manual entry' as const, loggedBy: m.loggedBy, remarks: m.remarks ?? '',
  }));

  const rows = [...manual, ...auto].sort((a, b) => b.at - a.at);
  const totalKg = rows.reduce((s, r) => s + r.qtyKg, 0);

  const columns = useMemo(() => [
    col<typeof rows[number]>('id', 'Entry ID', (r) => <span className="mono">{r.id}</span>, { sortFn: (r) => r.id, size: 130 }),
    col<typeof rows[number]>('src', 'Source', (r) => (
      <span className={clsx('rounded px-1.5 py-0.5 text-2xs font-semibold', r.source === 'Manual entry' ? 'bg-azure-50 text-azure-700' : 'bg-subtle text-txt-secondary')}>
        {r.source}
      </span>
    ), { size: 120 }),
    col<typeof rows[number]>('at', 'Logged (ET)', (r) => <span className="mono">{fmtTsMin(r.at)}</span>, { sortFn: (r) => r.at, size: 150 }),
    col<typeof rows[number]>('shift', 'Shift', (r) => r.shift, { size: 60 }),
    col<typeof rows[number]>('asset', 'Machine', (r) => <span className="mono">{r.assetId}</span>, { sortFn: (r) => r.assetId, size: 130 }),
    col<typeof rows[number]>('batch', 'Batch', (r) => <span className="mono">{r.batchId}</span>, { size: 180 }),
    col<typeof rows[number]>('reason', 'Reason', (r) => <span>{r.reasonCode} {r.reasonLabel}</span>, { sortFn: (r) => r.reasonCode, size: 280 }),
    col<typeof rows[number]>('qty', 'Qty (kg)', (r) => <span className="font-semibold">{num(r.qtyKg, 1)}</span>, { sortFn: (r) => r.qtyKg, size: 100 }),
    col<typeof rows[number]>('dispo', 'Disposition', (r) => r.disposition, { size: 120 }),
    col<typeof rows[number]>('by', 'Logged by', (r) => dash(r.loggedBy), { size: 130 }),
    col<typeof rows[number]>('remarks', 'Evidence / remarks', (r) => dash(r.remarks), { size: 250 }),
  ], []);

  return (
    <div className="space-y-4">
      {formOpen && <RejectionForm onClose={closeForm} onSave={addManualRejection} now={now} user={user} />}

      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <KpiTile label="Entries" value={rows.length} />
        <KpiTile label="Manual entries" value={manual.length} tone={manual.length ? 'ok' : 'default'} />
        <KpiTile label="Quantity affected" value={num(totalKg, 1)} unit="kg" tone="danger" />
        <KpiTile label="On hold" value={rows.filter((r) => r.disposition === 'HOLD').length} tone="warn" />
      </KpiStrip>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        height={420}
        exportName="obx-rejection-log"
        searchPlaceholder="Search batch, reason, machine"
        emptyTitle="No rejection entries"
        emptyHint="Log one with the button above."
        rowClassName={(r) => (r.source === 'Manual entry' ? 'bg-azure-50/40' : undefined)}
      />
    </div>
  );
}

function RejectionForm({
  onClose, onSave, now, user,
}: {
  onClose: () => void;
  onSave: (e: Omit<ManualRejection, 'id' | 'loggedBy' | 'loggedAt' | 'shift'>) => void;
  now: number;
  user: string;
}) {
  const [assetId, setAssetId] = useState(DS.assets[0].id);
  const [at, setAt] = useState(toLocalInput(now));
  const [batchId, setBatchId] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [qty, setQty] = useState('');
  const [disposition, setDisposition] = useState<Disposition>('HOLD');
  const [evidence, setEvidence] = useState('');
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');

  const asset = DS.assets.find((a) => a.id === assetId)!;
  const reasons = QL_REASONS.filter((r) => r.line === asset.line);
  const batches = useMemo(
    () => DS.batches.filter((b) => b.assetId === assetId).sort((a, b) => b.start - a.start).slice(0, 40),
    [assetId],
  );

  const submit = () => {
    const kg = Number(qty);
    if (!reasonCode) { setErr('Pick a reason before saving.'); return; }
    if (!batchId) { setErr('Select the affected batch.'); return; }
    if (!Number.isFinite(kg) || kg <= 0) { setErr('Enter the quantity affected in kg.'); return; }
    const label = QL_REASONS.find((r) => r.code === reasonCode)?.label ?? reasonCode;
    onSave({
      assetId, line: asset.line, at: fromLocalInput(at, now), batchId, reasonCode,
      reasonLabel: label, qtyKg: kg, disposition, evidence: evidence || undefined, remarks: remarks || undefined,
    });
    onClose();
  };

  return (
    <FormShell title="Log a rejection / quality loss" subtitle={`Entering as ${user}`} onClose={onClose} onSubmit={submit} err={err}>
      <Row2>
        <Field label="Machine" required>
          <select value={assetId} onChange={(e) => { setAssetId(e.target.value); setReasonCode(''); setBatchId(''); }} className={INPUT}>
            {DS.assets.map((a) => <option key={a.id} value={a.id}>{a.id} - {a.name}</option>)}
          </select>
        </Field>
        <Field label="Date / time (ET)" required>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={INPUT} />
        </Field>
      </Row2>

      <Row2>
        <Field label="Batch / lot" required>
          <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setErr(''); }} className={INPUT}>
            <option value="">Select a batch…</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
          </select>
        </Field>
        <Field label="Quantity affected (kg)" required>
          <input value={qty} onChange={(e) => { setQty(e.target.value); setErr(''); }} inputMode="decimal" placeholder="e.g. 21.4" className={INPUT} />
        </Field>
      </Row2>

      <Field label="Reason" required>
        <select value={reasonCode} onChange={(e) => { setReasonCode(e.target.value); setErr(''); }} className={INPUT}>
          <option value="">Select a reason…</option>
          {reasons.map((r) => <option key={r.code} value={r.code}>{r.code} - {r.label}</option>)}
        </select>
      </Field>

      <Field label="Disposition" required>
        <div className="flex flex-wrap gap-1.5">
          {DISPOSITIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisposition(d)}
              aria-pressed={disposition === d}
              className={clsx(
                'min-h-[40px] rounded-ctl border px-3 py-1.5 text-xs font-semibold',
                disposition === d ? 'border-azure-600 bg-azure-50 text-azure-700' : 'border-line hover:bg-subtle',
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-1 text-2xs text-txt-muted">
          An operator may raise a HOLD; only QA can set the final disposition. Scrap needs QA and Production Manager signatures.
        </p>
      </Field>

      <Field label="Evidence (lab result / COA)">
        <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. HPLC 98.62 % vs spec 99.0 %" className={INPUT} />
      </Field>

      <Field label="Remarks">
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value.slice(0, 500))} rows={2} maxLength={500} className={INPUT} />
      </Field>
    </FormShell>
  );
}

/* ------------------------------------------------------------------ form chrome */

const INPUT = 'w-full rounded-ctl border border-line bg-surface px-2.5 py-2 text-xs text-txt-primary';

function FormShell({
  title, subtitle, onClose, onSubmit, err, children,
}: {
  title: string; subtitle: string; onClose: () => void; onSubmit: () => void; err: string; children: React.ReactNode;
}) {
  return (
    <section className="fc-rise rounded-card border-2 border-azure-200 bg-azure-50/40">
      <header className="flex items-center justify-between gap-2 border-b border-azure-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-azure-600" />
          <div>
            <h2 className="text-sm font-semibold text-txt-primary">{title}</h2>
            <p className="text-2xs text-txt-muted">{subtitle}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close form" className="rounded p-1 text-txt-muted hover:bg-surface">
          <X size={15} />
        </button>
      </header>

      <div className="space-y-3 p-4">{children}</div>

      {err && <p className="px-4 pb-1 text-xs font-medium text-danger">{err}</p>}

      <footer className="flex justify-end gap-2 border-t border-azure-200 px-4 py-2.5">
        <button type="button" onClick={onClose} className="rounded-ctl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-txt-secondary hover:bg-subtle">
          Cancel
        </button>
        <button type="button" onClick={onSubmit} className="inline-flex items-center gap-1.5 rounded-ctl bg-azure-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-azure-700">
          <Save size={13} /> Save entry
        </button>
      </footer>
    </section>
  );
}

function ReadOnly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs text-txt-muted">{label}</div>
      <div className={clsx('text-xs text-txt-primary', mono && 'mono')}>{value}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold text-txt-secondary">
        {label}{required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

const Row2 = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);
