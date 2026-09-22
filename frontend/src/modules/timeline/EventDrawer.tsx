import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type Highcharts from 'highcharts';
import { Drawer, Row, Section, AuditTrail } from '../../components/Drawer';
import { StateChip, SourceBadge, BackfilledBadge, SeverityChip, IdLink } from '../../components/primitives';
import { ReasonPicker, topReasonsFor, actionPresets } from '../../components/ReasonPicker';
import { Chart } from '../../components/Chart';
import { useStore, DS } from '../../store/useStore';
import { fmtTs, fmtDuration, shiftSpan, MIN } from '../../lib/time';
import { withUnit, dash } from '../../lib/format';
import { getSeries } from '../../data/index';
import { snapshotTags } from './TimelineChart';
import type { UiEvent } from '../../lib/selectors';
import { isUnplanned } from '../../lib/states';

/** Right drawer for one timeline event: detail, reason tagger, parameter context, audit. */
export function EventDrawer({ event, onClose }: { event: UiEvent | null; onClose: () => void }) {
  const { now, user, role, tagEvent } = useStore();
  const nav = useNavigate();
  const [reason, setReason] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [remarks, setRemarks] = useState('');

  const asset = event ? DS.assets.find((a) => a.id === event.assetId) : undefined;
  const taggable = !!event && isUnplanned(event.state);
  const canTag = role === 'Operator' || role === 'Shift Supervisor' || role === 'Production Manager';

  // parameter context: +/- 30 min around the event start
  const sparks = useMemo(() => {
    if (!event) return [];
    const from = event.start - 30 * MIN;
    const to = Math.min(event.endOr + 30 * MIN, now);
    return snapshotTags(event.assetId).map((key) => {
      const tag = DS.tags.find((t) => t.assetId === event.assetId && t.key === key);
      const s = getSeries(DS, event.assetId, key, from, to, 60);
      return { key, tag, data: s.t.map((t, i) => [t, s.v[i]] as [number, number]) };
    });
  }, [event, now]);

  const linkedDeviations = useMemo(
    () => (event ? DS.deviations.filter((d) => d.linkedDowntimeId === event.id || (d.assetId === event.assetId && d.start >= event.start && d.start <= event.endOr)) : []),
    [event],
  );

  const linkedLogbooks = useMemo(
    () => (event ? DS.logbookEntries.filter((l) => l.assetId === event.assetId && l.dueAt >= event.start && l.dueAt <= event.endOr).slice(0, 5) : []),
    [event],
  );

  if (!event) return null;

  const reasonDef = event.reasonCode ? DS.reasons.find((r) => r.code === event.reasonCode) : undefined;
  const untagged = event.reasonCode === 'U000';

  const audit: { at: string; by: string; what: string; from?: string; to?: string; reason?: string }[] = [];
  audit.push({ at: fmtTs(event.start), by: 'System', what: `Event detected - ${event.detectedBy}` });
  if (event.taggedAt && event.taggedBy) {
    audit.push({
      at: fmtTs(event.taggedAt),
      by: event.taggedBy,
      what: 'Reason tagged',
      to: `${event.reasonCode} ${reasonDef?.label ?? ''}`,
    });
  }
  if (event.backfilled) audit.push({ at: fmtTs(event.endOr), by: 'Edge buffer', what: 'Data back-filled after network recovery' });

  const save = () => {
    if (!reason) return;
    tagEvent(event.id, reason, { action: action || undefined, remarks: remarks || undefined });
    setReason(null); setAction(''); setRemarks('');
  };

  const detailTab = (
    <>
      <Section title="Event">
        <Row label="Event ID"><span className="mono">{event.id.replace(/^EV-/, 'DT-')}</span></Row>
        <Row label="Status"><StateChip state={event.state} size="sm" ongoing={event.ongoing} /></Row>
        <Row label="Asset"><span className="mono">{event.assetId}</span> <span className="text-txt-muted">{asset?.name}</span></Row>
        <Row label="Start (ET)"><span className="mono">{fmtTs(event.start)}</span></Row>
        <Row label="End (ET)">{event.ongoing ? <span className="font-semibold text-warn">Ongoing</span> : <span className="mono">{fmtTs(event.endOr)}</span>}</Row>
        <Row label="Duration"><span className="mono font-semibold">{fmtDuration(event.durationMs)}</span></Row>
        <Row label="Shift">{shiftSpan(event.start, event.end, now)}</Row>
        <Row label="Batch">{event.batchId ? <IdLink id={event.batchId} onClick={() => nav(`/genealogy?batch=${event.batchId}`)} /> : '-'}</Row>
        <Row label="Phase">{dash(event.phase)}</Row>
        <Row label="Detected by">{event.detectedBy}</Row>
        {event.backfilled && <Row label="Data"><BackfilledBadge /></Row>}
        {event.expectedQty !== null && (
          <Row label="Expected / actual">
            <span className="mono">{event.expectedQty?.toFixed(1)} / {event.actualQty?.toFixed(1)} kg</span>
          </Row>
        )}
      </Section>

      {taggable && (
        <Section title={untagged ? 'Tag a reason' : 'Reason'}>
          {!untagged && (
            <div className="mb-2 rounded-ctl border border-line bg-subtle px-3 py-2 text-xs">
              <div className="font-semibold text-txt-primary">{event.reasonCode} {reasonDef?.label}</div>
              <div className="text-txt-muted">
                Tagged by {dash(event.taggedBy)}{event.taggedAt ? ` at ${fmtTs(event.taggedAt)}` : ''}
              </div>
            </div>
          )}
          {canTag ? (
            <>
              <ReasonPicker
                assetId={event.assetId}
                line={event.line}
                value={reason}
                onChange={setReason}
                quickCodes={topReasonsFor(event.assetId)}
              />
              {reason && (
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="lbl mb-1">What did you do?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {actionPresets(reason).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAction(a)}
                          className={
                            action === a
                              ? 'rounded-full border border-azure-600 bg-azure-50 px-2.5 py-1 text-2xs font-semibold text-azure-700'
                              : 'rounded-full border border-line px-2.5 py-1 text-2xs text-txt-secondary hover:bg-subtle'
                          }
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="lbl">Remarks</span>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value.slice(0, 500))}
                      rows={2}
                      maxLength={500}
                      className="mt-1 w-full rounded-ctl border border-line bg-surface px-2 py-1.5 text-xs"
                      placeholder="Optional - max 500 characters"
                    />
                  </label>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-txt-muted">
              Your role ({role}) can view but not tag reasons. Switch to Operator or Shift Supervisor in the top bar.
            </p>
          )}
        </Section>
      )}

      {sparks.length > 0 && (
        <Section title="Parameters around the event (+/- 30 min)">
          <div className="space-y-2">
            {sparks.map((s) => (
              <SparkRow key={s.key} label={s.tag?.label ?? s.key} unit={s.tag?.unit ?? ''} data={s.data} eventStart={event.start} eventEnd={event.endOr} usl={s.tag?.usl} lsl={s.tag?.lsl} source={s.tag?.source} />
            ))}
          </div>
        </Section>
      )}

      {linkedDeviations.length > 0 && (
        <Section title="Linked deviations">
          <ul className="space-y-1">
            {linkedDeviations.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-ctl border border-line px-2 py-1.5 text-xs">
                <span className="mono">{d.id}</span>
                <span className="min-w-0 flex-1 truncate text-txt-secondary">{d.tagKey} {d.limitType}</span>
                <SeverityChip severity={d.severity} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {linkedLogbooks.length > 0 && (
        <Section title="Logbook entries during this event">
          <ul className="space-y-1">
            {linkedLogbooks.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-ctl border border-line px-2 py-1.5 text-xs">
                <span className="mono">{l.formNo}</span>
                <span className="text-txt-muted">{fmtTs(l.dueAt)}</span>
                <span className="font-semibold">{l.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={<span className="mono">{event.id.replace(/^EV-/, 'DT-')}</span>}
      subtitle={<span>{event.assetId} &middot; {asset?.name}</span>}
      tabs={[
        { id: 'details', label: 'Details', content: detailTab },
        { id: 'audit', label: 'Audit trail', content: <AuditTrail entries={audit} /> },
      ]}
      footer={
        taggable && canTag ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-txt-muted">Signed as {user}</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-ctl border border-line px-3 py-1.5 text-xs text-txt-secondary hover:bg-subtle">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!reason}
                className="rounded-ctl bg-azure-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Save reason
              </button>
            </div>
          </div>
        ) : undefined
      }
    />
  );
}

function SparkRow({
  label, unit, data, eventStart, eventEnd, usl, lsl, source,
}: {
  label: string; unit: string; data: [number, number][]; eventStart: number; eventEnd: number;
  usl?: number; lsl?: number; source?: string;
}) {
  const last = data.length ? data[data.length - 1][1] : null;
  const options: Highcharts.Options = {
    chart: { height: 70, margin: [6, 4, 14, 40], backgroundColor: 'transparent' },
    xAxis: {
      type: 'datetime',
      labels: { style: { fontSize: '9px' } },
      plotBands: [{ from: eventStart, to: eventEnd, color: 'rgba(229,72,77,.12)' }],
    },
    yAxis: {
      title: { text: undefined },
      labels: { style: { fontSize: '9px' } },
      plotLines: [
        ...(usl !== undefined ? [{ value: usl, color: '#D92D20', width: 1, dashStyle: 'Dash' as const, zIndex: 3 }] : []),
        ...(lsl !== undefined ? [{ value: lsl, color: '#D92D20', width: 1, dashStyle: 'Dash' as const, zIndex: 3 }] : []),
      ],
    },
    legend: { enabled: false },
    accessibility: { enabled: false },
    tooltip: { enabled: true, xDateFormat: '%Y-%m-%d %H:%M' },
    series: [{ type: 'line', name: label, data, color: '#1655F2', lineWidth: 1.25 }],
  };
  return (
    <div className="rounded-ctl border border-line px-2 pt-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold text-txt-secondary">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="mono text-2xs">{withUnit(last, unit)}</span>
          {source && <SourceBadge source={source as never} />}
        </span>
      </div>
      <Chart options={options} height={70} />
    </div>
  );
}
