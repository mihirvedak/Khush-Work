import { useMemo, useState } from 'react';
import { useStore, DS } from '../../store/useStore';
import { selectDeviations } from '../../lib/selectors';
import { fmtTs, fmtDuration } from '../../lib/time';
import { num, dash } from '../../lib/format';
import { SeverityChip, StateChip, IdLink, DemoLimitTag, Card, CardHeader } from '../../components/primitives';
import { KpiTile, KpiStrip } from '../../components/KpiTile';
import { DataTable, col } from '../../components/DataTable';
import { Drawer, Row, Section, AuditTrail } from '../../components/Drawer';
import { EscalationStepper } from '../../components/Signature';
import { ChartCard } from '../../components/Chart';
import { getSeries } from '../../data/index';
import { LIMIT_STYLE } from '../../theme/highcharts';
import { MIN } from '../../lib/time';
import type { Deviation } from '../../data/types';
import type Highcharts from 'highcharts';

const LIMIT_LABEL: Record<string, string> = {
  Spec: 'Spec limit',
  Control: 'Control rule',
  Golden: 'Golden tunnel exit',
};

export function DeviationsTab({ from, to }: { from: number; to: number }) {
  const { line, assetIds, overlay, now, role, ackDeviation } = useStore();
  const [selected, setSelected] = useState<Deviation | null>(null);

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );

  const devs = useMemo(
    () => selectDeviations(DS, { assetIds: assets.map((a) => a.id), from, to }, overlay),
    [assets, from, to, overlay],
  );

  const open = devs.filter((d) => d.status !== 'Closed');
  const critical = devs.filter((d) => d.severity === 'Critical');
  const ongoing = devs.filter((d) => d.end === null);

  const columns = useMemo(() => [
    col<Deviation>('id', 'DEV ID', (r) => <span className="mono">{r.id}</span>, { sortFn: (r) => r.id, size: 130 }),
    col<Deviation>('sev', 'Severity', (r) => <SeverityChip severity={r.severity} />, { sortFn: (r) => ({ Critical: 0, Major: 1, Minor: 2 }[r.severity]), size: 110 }),
    col<Deviation>('start', 'Detected (ET)', (r) => <span className="mono">{fmtTs(r.start)}</span>, { sortFn: (r) => r.start, size: 160 }),
    col<Deviation>('end', 'Ended (ET)', (r) => (r.end === null ? <span className="font-semibold text-warn">Ongoing</span> : <span className="mono">{fmtTs(r.end)}</span>), { sortFn: (r) => r.end ?? Infinity, size: 150 }),
    col<Deviation>('dur', 'Duration', (r) => <span className="mono">{fmtDuration((r.end ?? now) - r.start)}</span>, { sortFn: (r) => (r.end ?? now) - r.start, size: 100 }),
    col<Deviation>('asset', 'Asset', (r) => <span className="mono">{r.assetId}</span>, { sortFn: (r) => r.assetId, size: 130 }),
    col<Deviation>('batch', 'Batch', (r) => (r.batchId ? <IdLink id={r.batchId} /> : '-'), { size: 170 }),
    col<Deviation>('phase', 'Phase', (r) => dash(r.phase), { size: 110 }),
    col<Deviation>('tag', 'Parameter', (r) => <span className="mono">{r.tagKey}</span>, { sortFn: (r) => r.tagKey, size: 120 }),
    col<Deviation>('limitType', 'Limit type', (r) => LIMIT_LABEL[r.limitType] ?? r.limitType, { size: 150 }),
    col<Deviation>('limit', 'Limit', (r) => <span className="mono">{num(r.limit, 2)}</span>, { size: 90 }),
    col<Deviation>('worst', 'Worst value', (r) => <span className="mono font-semibold text-danger">{num(r.worst, 2)}</span>, { sortFn: (r) => r.worst, size: 110 }),
    col<Deviation>('status', 'Status', (r) => r.status, { sortFn: (r) => r.status, size: 150 }),
    col<Deviation>('esc', 'Escalation', (r) => <span className={r.escalationLevel >= 3 ? 'font-semibold text-danger' : ''}>L{r.escalationLevel}</span>, { size: 100 }),
    col<Deviation>('assigned', 'Assigned to', (r) => r.assignedTo, { size: 140 }),
    col<Deviation>('rc', 'Root cause', (r) => <span title={r.rootCause ?? ''}>{dash(r.rootCause)}</span>, { size: 240 }),
    col<Deviation>('capa', 'CAPA', (r) => dash(r.capaId), { size: 110 }),
  ], [now]);

  return (
    <div className="space-y-3">
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <KpiTile label="Open deviations" value={open.length} tone={open.length ? 'warn' : 'default'} />
        <KpiTile label="Critical" value={critical.length} tone={critical.length ? 'danger' : 'default'} />
        <KpiTile label="Ongoing now" value={ongoing.length} tone={ongoing.length ? 'danger' : 'default'} />
        <KpiTile label="Total in window" value={devs.length} />
      </KpiStrip>

      <Card>
        <CardHeader
          title="Deviation log"
          subtitle={
            <span className="inline-flex items-center gap-1.5">
              Spec breaches, control-rule violations and golden-tunnel exits
              <DemoLimitTag />
            </span>
          }
        />
        <DataTable
          data={devs}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={setSelected}
          height={420}
          exportName="obx-deviations"
          searchPlaceholder="Search asset, parameter, batch"
          emptyTitle="No deviations in this window"
          emptyHint="Widen the date range."
          rowClassName={(r) => (r.severity === 'Critical' ? 'bg-danger-bg/40' : r.end === null ? 'bg-warn-bg/30' : undefined)}
          initialSorting={[{ id: 'start', desc: true }]}
        />
      </Card>

      {selected && (
        <DeviationDrawer
          dev={selected}
          now={now}
          canAck={role !== 'Admin'}
          onAck={() => ackDeviation(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function DeviationDrawer({
  dev, now, canAck, onAck, onClose,
}: { dev: Deviation; now: number; canAck: boolean; onAck: () => void; onClose: () => void }) {
  const tag = DS.tags.find((t) => t.assetId === dev.assetId && t.key === dev.tagKey);

  // zoom the trend to +/- 30 min around the excursion, with the breach shaded
  const options: Highcharts.Options = useMemo(() => {
    const end = dev.end ?? now;
    const s = getSeries(DS, dev.assetId, dev.tagKey, dev.start - 30 * MIN, end + 30 * MIN, 30);
    return {
      chart: { height: 220 },
      xAxis: {
        type: 'datetime',
        plotBands: [{ from: dev.start, to: end, color: 'rgba(229,72,77,.14)', label: { text: 'excursion', style: { fontSize: '9px', color: '#B42318' } } }],
      },
      yAxis: {
        title: { text: tag?.unit ?? '' },
        plotLines: [{ value: dev.limit, ...LIMIT_STYLE.spec, label: { text: `limit ${dev.limit}`, style: { fontSize: '9px', color: LIMIT_STYLE.spec.color } }, zIndex: 4 }],
      },
      legend: { enabled: false },
      tooltip: { xDateFormat: '%Y-%m-%d %H:%M:%S', valueDecimals: 3 },
      series: [{ type: 'line', name: dev.tagKey, color: '#1655F2', lineWidth: 1.25, marker: { enabled: false }, data: s.t.map((t, i) => [t, s.v[i]]) }],
    };
  }, [dev, now, tag]);

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={<span className="mono">{dev.id}</span>}
      subtitle={<span>{dev.assetId} &middot; {dev.tagKey}</span>}
      tabs={[
        {
          id: 'details',
          label: 'Details',
          content: (
            <>
              <Section title="Excursion">
                <Row label="Severity"><SeverityChip severity={dev.severity} /></Row>
                <Row label="Limit type">{LIMIT_LABEL[dev.limitType]}</Row>
                <Row label="Limit"><span className="mono">{num(dev.limit, 3)} {tag?.unit ?? ''}</span></Row>
                <Row label="Worst value"><span className="mono font-semibold text-danger">{num(dev.worst, 3)} {tag?.unit ?? ''}</span></Row>
                <Row label="Detected"><span className="mono">{fmtTs(dev.start)}</span></Row>
                <Row label="Ended">{dev.end === null ? <span className="font-semibold text-warn">Ongoing</span> : <span className="mono">{fmtTs(dev.end)}</span>}</Row>
                <Row label="Duration"><span className="mono">{fmtDuration((dev.end ?? now) - dev.start)}</span></Row>
                <Row label="Batch / phase">{dash(dev.batchId)} {dev.phase ? `· ${dev.phase}` : ''}</Row>
                <Row label="Status">{dev.status}</Row>
                <Row label="Assigned to">{dev.assignedTo}</Row>
                <Row label="Root cause">{dash(dev.rootCause)}</Row>
                <Row label="CAPA">{dash(dev.capaId)}</Row>
                <Row label="Linked downtime">{dash(dev.linkedDowntimeId?.replace(/^EV-/, 'DT-'))}</Row>
              </Section>

              <Section title="Trend around the excursion">
                <ChartCard title="" subtitle="" height={220} options={options} />
              </Section>

              <Section title="Escalation">
                <EscalationStepper level={dev.escalationLevel} acknowledged={dev.status !== 'Open'} />
                {dev.status === 'Open' && canAck && (
                  <button
                    type="button"
                    onClick={() => { onAck(); onClose(); }}
                    className="mt-3 w-full rounded-ctl bg-azure-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Acknowledge deviation
                  </button>
                )}
              </Section>
            </>
          ),
        },
        {
          id: 'audit',
          label: 'Audit trail',
          content: (
            <AuditTrail
              entries={[
                { at: fmtTs(dev.start), by: 'System', what: `Detected - ${LIMIT_LABEL[dev.limitType]} on ${dev.tagKey}`, to: `${num(dev.worst, 3)} vs limit ${num(dev.limit, 3)}` },
                ...(dev.status !== 'Open' ? [{ at: fmtTs(dev.start + 15 * MIN), by: dev.assignedTo, what: `Status - ${dev.status}` }] : []),
                ...(dev.end ? [{ at: fmtTs(dev.end), by: 'System', what: 'Excursion ended' }] : []),
              ]}
            />
          ),
        },
      ]}
    />
  );
}

export { StateChip };
