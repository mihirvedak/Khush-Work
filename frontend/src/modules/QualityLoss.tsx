import { useMemo, useState } from 'react';
import type Highcharts from 'highcharts';
import { FlaskConical, ShieldAlert } from 'lucide-react';
import { useStore, useRange, DS } from '../store/useStore';
import { selectQualityLosses, qualityMetrics, selectBatches } from '../lib/selectors';
import { fmtTs, fmtTsMin, dayKey, hours } from '../lib/time';
import { num, pct, dash } from '../lib/format';
import { Card, CardHeader, Banner, IdLink, SourceBadge } from '../components/primitives';
import { KpiTile, KpiStrip, Stat } from '../components/KpiTile';
import { ChartCard } from '../components/Chart';
import { DataTable, col } from '../components/DataTable';
import { Drawer, Row, Section, AuditTrail } from '../components/Drawer';
import { SignatureDialog } from '../components/Signature';
import type { QualityLoss as QL, Disposition } from '../data/types';

const DISPOSITIONS: Disposition[] = ['HOLD', 'REWORK', 'DOWNGRADE', 'SCRAP'];

const DISPO_STYLE: Record<Disposition, { fg: string; bg: string }> = {
  HOLD:      { fg: '#B7791F', bg: '#FDF3D8' },
  REWORK:    { fg: '#0F43C4', bg: '#EEF3FF' },
  DOWNGRADE: { fg: '#C2410C', bg: '#FFEDD5' },
  SCRAP:     { fg: '#B42318', bg: '#FDECEC' },
};

function DispoChip({ d }: { d: Disposition }) {
  const s = DISPO_STYLE[d];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold" style={{ background: s.bg, color: s.fg }}>
      {d}
    </span>
  );
}

export function QualityLoss({ embedded }: { embedded?: boolean } = {}) {
  const { line, assetIds, shift, overlay, role, setDisposition, sign } = useStore();
  const range = useRange();
  const [selected, setSelected] = useState<QL | null>(null);
  const [pendingDispo, setPendingDispo] = useState<Disposition | null>(null);
  const [recovered, setRecovered] = useState('');
  const [signOpen, setSignOpen] = useState(false);

  const assets = useMemo(
    () => DS.assets.filter((a) => (line === 'ALL' || a.line === line) && (!assetIds.length || assetIds.includes(a.id))),
    [line, assetIds],
  );
  const q = { assetIds: assets.map((a) => a.id), from: range.from, to: range.to, shift };

  const losses = useMemo(() => selectQualityLosses(DS, q, overlay), [assets, range.from, range.to, shift, overlay]);
  const m = useMemo(() => qualityMetrics(losses), [losses]);

  // first-pass yield from the batches that closed in this window
  const batches = useMemo(() => selectBatches(DS, q).filter((b) => b.end !== null), [assets, range.from, range.to]);
  const firstPassYield = useMemo(() => {
    const total = batches.reduce((s, b) => s + (b.outputKg ?? 0), 0);
    const good = batches.reduce((s, b) => s + (b.goodKg ?? 0), 0);
    return total ? good / total : null;
  }, [batches]);

  /** Rework consumes reactor time - the cost the client would otherwise miss (ref 03). */
  const reworkHours = useMemo(() => {
    let h = 0;
    for (const l of losses) {
      if (l.disposition !== 'REWORK') continue;
      const asset = DS.assets.find((a) => a.id === l.assetId);
      const cycle = asset?.phases.reduce((s, p) => s + p.idealH, 0) ?? 0;
      const size = asset ? (asset.batchSizeKg[0] + asset.batchSizeKg[1]) / 2 : 0;
      h += size ? (l.qtyKg / size) * cycle : 0;
    }
    return h;
  }, [losses]);

  // ------------------------------------------------------------- charts
  const byReason = useMemo(() => {
    const acc = new Map<string, { kg: number; label: string }>();
    for (const l of losses) {
      const cur = acc.get(l.reasonCode) ?? { kg: 0, label: l.reasonLabel };
      acc.set(l.reasonCode, { kg: cur.kg + l.qtyKg, label: l.reasonLabel });
    }
    return [...acc.entries()].sort((a, b) => b[1].kg - a[1].kg).slice(0, 12);
  }, [losses]);

  const reasonOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'bar' },
    xAxis: { categories: byReason.map(([code]) => code), labels: { style: { fontSize: '10px' } } },
    yAxis: { title: { text: 'Quality loss (kg)' }, min: 0 },
    legend: { enabled: false },
    tooltip: {
      formatter(this: Highcharts.Point) {
        const r = byReason[this.index ?? 0];
        return `<b>${r[0]}</b><br>${r[1].label}<br><b>${r[1].kg.toFixed(1)} kg</b>`;
      },
    },
    series: [{
      type: 'bar',
      name: 'kg',
      data: byReason.map(([code, v]) => ({ y: v.kg, color: code.startsWith('QL1') ? '#0F766E' : '#1655F2' })),
      dataLabels: { enabled: true, format: '{y:.1f}', style: { fontSize: '10px', textOutline: 'none' } },
    }],
  }), [byReason]);

  const bySplit = useMemo(() => {
    const acc: Record<string, Record<Disposition, number>> = {};
    for (const l of losses) {
      const key = l.line;
      acc[key] ??= { HOLD: 0, REWORK: 0, DOWNGRADE: 0, SCRAP: 0 };
      acc[key][l.disposition] += l.qtyKg;
    }
    return acc;
  }, [losses]);

  const splitOptions: Highcharts.Options = useMemo(() => {
    const lines = Object.keys(bySplit);
    return {
      chart: { type: 'column' },
      xAxis: { categories: lines.map((l) => (l === 'L1' ? 'L1 Kratom / MIT' : 'L2 Bulk Cannabinoids')) },
      yAxis: { title: { text: 'kg' }, min: 0 },
      tooltip: { shared: true, valueSuffix: ' kg', valueDecimals: 1 },
      plotOptions: { column: { stacking: 'normal', borderRadius: 2 } },
      series: DISPOSITIONS.map((d) => ({
        type: 'column' as const,
        name: d,
        color: DISPO_STYLE[d].fg,
        data: lines.map((l) => bySplit[l][d]),
      })),
    };
  }, [bySplit]);

  const byShiftDay = useMemo(() => {
    const acc = new Map<string, { A: number; B: number }>();
    for (const l of losses) {
      const d = dayKey(l.at);
      const cur = acc.get(d) ?? { A: 0, B: 0 };
      cur[l.shift] += l.qtyKg;
      acc.set(d, cur);
    }
    return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [losses]);

  const shiftOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'column' },
    xAxis: { categories: byShiftDay.map(([d]) => d.slice(5)), labels: { style: { fontSize: '10px' } } },
    yAxis: { title: { text: 'kg lost' }, min: 0 },
    tooltip: { shared: true, valueSuffix: ' kg', valueDecimals: 1 },
    series: [
      { type: 'column', name: 'Shift A', color: '#1655F2', data: byShiftDay.map(([, v]) => v.A) },
      { type: 'column', name: 'Shift B', color: '#6E56CF', data: byShiftDay.map(([, v]) => v.B) },
    ],
  }), [byShiftDay]);

  const fpyByAsset = useMemo(() => {
    const acc = new Map<string, { good: number; total: number }>();
    for (const b of batches) {
      const cur = acc.get(b.assetId) ?? { good: 0, total: 0 };
      cur.good += b.goodKg ?? 0;
      cur.total += b.outputKg ?? 0;
      acc.set(b.assetId, cur);
    }
    return [...acc.entries()]
      .filter(([, v]) => v.total > 0)
      .map(([id, v]) => ({ id, fpy: (v.good / v.total) * 100 }))
      .sort((a, b) => a.fpy - b.fpy);
  }, [batches]);

  const fpyOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'bar' },
    xAxis: { categories: fpyByAsset.map((r) => r.id), labels: { style: { fontSize: '10px' } } },
    yAxis: { title: { text: 'First-pass yield (%)' }, min: 0, max: 100, plotLines: [{ value: 95, color: '#7A889A', width: 1, dashStyle: 'Dash', label: { text: 'demo target 95 %', style: { fontSize: '9px', color: '#7A889A' } } }] },
    legend: { enabled: false },
    tooltip: { valueSuffix: ' %', valueDecimals: 1 },
    series: [{
      type: 'bar',
      name: 'FPY',
      data: fpyByAsset.map((r) => ({ y: r.fpy, color: r.fpy < 90 ? '#D92D20' : r.fpy < 95 ? '#B7791F' : '#1E9E5A' })),
      dataLabels: { enabled: true, format: '{y:.1f}%', style: { fontSize: '10px', textOutline: 'none' } },
    }],
  }), [fpyByAsset]);

  // ------------------------------------------------------------- table
  const columns = useMemo(() => [
    col<QL>('id', 'QL ID', (r) => <span className="mono">{r.id}</span>, { sortFn: (r) => r.id, size: 120 }),
    col<QL>('at', 'Raised (ET)', (r) => <span className="mono">{fmtTsMin(r.at)}</span>, { sortFn: (r) => r.at, size: 140 }),
    col<QL>('shift', 'Shift', (r) => r.shift, { size: 60 }),
    col<QL>('asset', 'Line / Stage / Asset', (r) => <span className="mono">{r.line} / {r.stage} / {r.assetId}</span>, { sortFn: (r) => r.assetId, size: 220 }),
    col<QL>('batch', 'Batch / Lot', (r) => <IdLink id={r.batchId} />, { sortFn: (r) => r.batchId, size: 180 }),
    col<QL>('reason', 'Reason', (r) => <span>{r.reasonCode} {r.reasonLabel}</span>, { sortFn: (r) => r.reasonCode, size: 280 }),
    col<QL>('evidence', 'Evidence', (r) => (
      <span className="inline-flex items-center gap-1">{dash(r.evidence)}<SourceBadge source="LIMS/COA" /></span>
    ), { size: 230 }),
    col<QL>('qty', 'Qty affected (kg)', (r) => <span className="font-semibold">{num(r.qtyKg, 1)}</span>, { sortFn: (r) => r.qtyKg, size: 140 }),
    col<QL>('dispo', 'Disposition', (r) => <DispoChip d={r.disposition} />, { sortFn: (r) => r.disposition, size: 130 }),
    col<QL>('recovered', 'Recovered (kg)', (r) => num(r.recoveredKg, 1), { sortFn: (r) => r.recoveredKg ?? 0, size: 130 }),
    col<QL>('status', 'Status', (r) => r.status, { size: 120 }),
    col<QL>('raised', 'Raised by', (r) => r.raisedBy, { size: 120 }),
    col<QL>('dispoBy', 'Dispositioned by', (r) => dash(r.dispositionedBy), { size: 150 }),
    col<QL>('dev', 'Linked deviation', (r) => (r.deviationId ? <span className="mono">{r.deviationId}</span> : '-'), { size: 150 }),
  ], []);

  const scrapOrCritical = losses.filter((l) => l.disposition === 'SCRAP' || /THC|7-OH/i.test(l.reasonLabel));

  return (
    <div className="space-y-4">
      {!embedded && (
      <header>
        <h1 className="font-display text-title font-bold">Quality Loss &amp; Disposition Logger</h1>
        <p className="lbl mt-0.5">
          In OBX&rsquo;s processes material is rarely scrapped &mdash; it is held, reworked or downgraded.
          This logger captures the mass <em>and</em> the disposition, so rework cost is visible.
        </p>
      </header>
      )}

      {scrapOrCritical.length > 0 && (
        <Banner tone="danger" icon={<ShieldAlert size={16} />}>
          <b>{scrapOrCritical.length} record{scrapOrCritical.length === 1 ? '' : 's'} require QA and Plant Head attention</b> &mdash;
          {' '}scrap, or a hold for Delta-9 THC / 7-OH. These escalate to QA immediately per the escalation matrix.
        </Banner>
      )}

      <KpiStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Quality loss" value={num(m.totalKg, 1)} unit="kg" tone="danger" />
        <KpiTile label="Rework" value={num(m.reworkKg, 1)} unit={`kg (${m.totalKg ? ((m.reworkKg / m.totalKg) * 100).toFixed(0) : 0} %)`} />
        <KpiTile label="Scrap" value={num(m.scrapKg, 1)} unit="kg" tone={m.scrapKg > 0 ? 'danger' : 'default'} />
        <KpiTile label="On hold" value={num(m.holdKg, 1)} unit={`kg (${m.holdLots} lot${m.holdLots === 1 ? '' : 's'})`} tone={m.holdKg ? 'warn' : 'default'} />
        <KpiTile label="First-pass yield" value={firstPassYield === null ? '-' : pct(firstPassYield)} tone={firstPassYield !== null && firstPassYield < 0.9 ? 'warn' : 'ok'} hint="Mass-weighted, from batches closed in this window" />
        <KpiTile label="Rework reactor-hours" value={num(reworkHours, 0)} unit="h" hint="Ideal cycle time consumed re-processing material - availability the plant never gets back" />
      </KpiStrip>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Quality loss by reason"
          subtitle={`Top ${byReason.length} reasons, kg lost`}
          height={Math.max(260, 60 + byReason.length * 22)}
          options={reasonOptions}
          tableView={{ columns: ['Code', 'Reason', 'kg'], rows: byReason.map(([c, v]) => [c, v.label, v.kg.toFixed(1)]) }}
          empty={byReason.length ? null : { title: 'No quality losses in this window' }}
        />
        <ChartCard
          title="Disposition split by line"
          subtitle="Hold / Rework / Downgrade / Scrap"
          height={280}
          options={splitOptions}
          empty={Object.keys(bySplit).length ? null : { title: 'No quality losses in this window' }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Shift-wise quality loss"
          subtitle="kg lost per day, A vs B"
          height={260}
          options={shiftOptions}
          empty={byShiftDay.length ? null : { title: 'No quality losses in this window' }}
        />
        <ChartCard
          title="First-pass yield by asset"
          subtitle="Mass-weighted, batches closed in this window"
          height={Math.max(260, 60 + fpyByAsset.length * 20)}
          options={fpyOptions}
          empty={fpyByAsset.length ? null : { title: 'No closed batches in this window' }}
        />
      </div>

      <Card>
        <CardHeader title="Quality loss records" subtitle={`${losses.length} records`} />
        <DataTable
          data={losses}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => { setSelected(r); setPendingDispo(null); setRecovered(''); }}
          height={400}
          exportName="obx-quality-loss"
          searchPlaceholder="Search batch, reason, asset"
          emptyTitle="No quality loss records"
          emptyHint="Widen the date range or clear filters."
          rowClassName={(r) => (r.disposition === 'SCRAP' ? 'bg-danger-bg/40' : r.status === 'Open' ? 'bg-warn-bg/30' : undefined)}
        />
      </Card>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          width={540}
          title={<span className="mono">{selected.id}</span>}
          subtitle={`${selected.assetId} · ${selected.stage}`}
          tabs={[
            {
              id: 'details',
              label: 'Details',
              content: (
                <>
                  <Section title="Record">
                    <Row label="Raised"><span className="mono">{fmtTs(selected.at)}</span> (shift {selected.shift})</Row>
                    <Row label="Batch / lot"><span className="mono">{selected.batchId}</span></Row>
                    <Row label="Reason">{selected.reasonCode} {selected.reasonLabel}</Row>
                    <Row label="Evidence">
                      <span className="inline-flex items-center gap-1">{selected.evidence}<SourceBadge source="LIMS/COA" /></span>
                    </Row>
                    <Row label="Quantity affected">
                      <span className="inline-flex items-center gap-1 font-semibold">{num(selected.qtyKg, 1)} kg<SourceBadge source="Scale" /></span>
                    </Row>
                    <Row label="Current disposition"><DispoChip d={selected.disposition} /></Row>
                    <Row label="Recovered">{num(selected.recoveredKg, 1)} kg</Row>
                    <Row label="Status">{selected.status}</Row>
                    <Row label="Raised by">{selected.raisedBy}</Row>
                    <Row label="Dispositioned by">{dash(selected.dispositionedBy)}</Row>
                    <Row label="Linked deviation">{dash(selected.deviationId)}</Row>
                  </Section>

                  <Section title="Set disposition">
                    {role === 'QA' ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {DISPOSITIONS.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setPendingDispo(d)}
                              className={
                                pendingDispo === d
                                  ? 'min-h-[44px] rounded-ctl border-2 border-azure-600 bg-azure-50 px-3 py-2 text-xs font-semibold'
                                  : 'min-h-[44px] rounded-ctl border border-line px-3 py-2 text-xs hover:bg-subtle'
                              }
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                        {pendingDispo === 'REWORK' && (
                          <label className="mt-2 block">
                            <span className="lbl">Recovered quantity after rework (kg)</span>
                            <input
                              value={recovered}
                              onChange={(e) => setRecovered(e.target.value)}
                              inputMode="decimal"
                              className="mt-1 w-full rounded-ctl border border-line bg-surface px-2 py-1.5 text-sm"
                              placeholder="Record closes once this is entered"
                            />
                          </label>
                        )}
                        {pendingDispo === 'SCRAP' && (
                          <p className="mt-2 rounded-ctl bg-danger-bg px-2 py-1.5 text-2xs text-danger">
                            Scrap requires QA <b>and</b> Production Manager dual signature, and a disposal record.
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={!pendingDispo}
                          onClick={() => setSignOpen(true)}
                          className="mt-3 w-full rounded-ctl bg-azure-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Sign and apply disposition
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-txt-muted">
                        Only QA can set a disposition; an operator can raise a HOLD. Switch role to QA in the top bar.
                      </p>
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
                    { at: fmtTs(selected.at), by: selected.raisedBy, what: `Raised - ${selected.reasonCode}` },
                    ...(selected.dispositionedBy
                      ? [{ at: fmtTs(selected.at), by: selected.dispositionedBy, what: 'Disposition set', to: selected.disposition }]
                      : []),
                    ...((overlay.dispositions[selected.id]
                      ? [{
                          at: fmtTs(overlay.dispositions[selected.id].at),
                          by: overlay.dispositions[selected.id].by,
                          what: 'Disposition changed in demo',
                          to: overlay.dispositions[selected.id].disposition,
                        }]
                      : [])),
                  ]}
                />
              ),
            },
          ]}
        />
      )}

      <SignatureDialog
        open={signOpen}
        onClose={() => setSignOpen(false)}
        meaning="Approved"
        entity={selected ? `${selected.id} - disposition ${pendingDispo}` : ''}
        onSign={() => {
          if (selected && pendingDispo) {
            setDisposition(selected.id, pendingDispo, recovered ? Number(recovered) : undefined);
            sign(selected.id, 'Approve', 'Disposition approved');
            setSelected({ ...selected, disposition: pendingDispo, status: 'Dispositioned' });
          }
        }}
      />
    </div>
  );
}

export { FlaskConical, Stat, hours };
