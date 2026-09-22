import { useMemo } from 'react';
import type Highcharts from 'highcharts';
import { DS } from '../../store/useStore';
import { ChartCard } from '../../components/Chart';
import { KpiTile, KpiStrip } from '../../components/KpiTile';
import { Card, CardHeader, SourceBadge, DemoLimitTag } from '../../components/primitives';
import { num } from '../../lib/format';
import { DAY } from '../../lib/time';

/**
 * Heptane balance for L1 (ref 01 section 2.4). The generator does not model solvent,
 * so this tab derives the balance from MIT freebase output and the documented demo
 * loss split. Every number is labelled as a demo model, and the two meters that do
 * not exist today are flagged as proposed instrumentation.
 */
const LOSS_SPLIT = [
  { key: 'LLE', label: 'LLE - entrained in aqueous', share: 0.38, colour: '#1655F2' },
  { key: 'SRU', label: 'SRU - condenser vent / slip', share: 0.27, colour: '#EA7A1A' },
  { key: 'FIL', label: 'Filter / dryer - wet cake', share: 0.21, colour: '#6E56CF' },
  { key: 'UNACC', label: 'Unaccounted - tank reconciliation gap', share: 0.14, colour: '#B42318' },
];

const TARGET_L_PER_KG = 6.0;

export function SolventTab({ from, to }: { from: number; to: number }) {
  const model = useMemo(() => {
    // MIT freebase produced in the window drives the whole balance
    const freebaseKg = DS.batches
      .filter((b) => b.assetId.startsWith('L1-FIL') && b.end !== null && b.end >= from && b.end <= to)
      .reduce((s, b) => s + (b.outputKg ?? 0), 0);

    // demo actual loss rate sits in the documented 6.8 - 11.5 L/kg band
    const lossPerKg = 8.9;
    const totalLoss = freebaseKg * lossPerKg;

    // recovery is high: the SRU returns most of what goes round the loop
    const recoveryRate = 0.87;
    const toProcess = totalLoss / (1 - recoveryRate);
    const recovered = toProcess * recoveryRate;
    const fresh = totalLoss; // steady state: fresh make-up replaces what is lost

    return { freebaseKg, lossPerKg, totalLoss, toProcess, recovered, fresh };
  }, [from, to]);

  const days = Math.max(1, Math.round((to - from) / DAY));

  const sankey: Highcharts.Options = useMemo(() => {
    const { fresh, recovered, toProcess, totalLoss } = model;
    const toLLE = toProcess * 0.72;
    const toCRY = toProcess * 0.28;

    const data: [string, string, number][] = [
      ['Fresh heptane (ERP receipts)', 'Process loop', fresh],
      ['Recovered heptane (SRU)', 'Process loop', recovered],
      ['Process loop', 'LLE extraction', toLLE],
      ['Process loop', 'Crystallization washes', toCRY],
      ['LLE extraction', 'Recovered to SRU', toLLE * 0.86],
      ['Crystallization washes', 'Recovered to SRU', toCRY * 0.78],
      ...LOSS_SPLIT.map((l) => [
        l.key === 'LLE' ? 'LLE extraction' : l.key === 'FIL' ? 'Crystallization washes' : 'Recovered to SRU',
        `Loss - ${l.label}`,
        totalLoss * l.share,
      ] as [string, string, number]),
    ];

    return {
      chart: { type: 'sankey', height: 340 },
      tooltip: {
        formatter(this: Highcharts.Point) {
          const p = this as unknown as { from?: string; to?: string; weight?: number; name?: string };
          if (p.from && p.to) return `<b>${p.from} &rarr; ${p.to}</b><br>${num(p.weight, 0)} L`;
          return `<b>${p.name}</b>`;
        },
      },
      plotOptions: {
        sankey: {
          nodePadding: 12,
          linkOpacity: 0.45,
          dataLabels: { style: { fontSize: '10px', fontWeight: '600', textOutline: 'none' } },
        },
      },
      series: [{
        type: 'sankey',
        name: 'Heptane (L)',
        keys: ['from', 'to', 'weight'],
        data,
        nodes: [
          { id: 'Fresh heptane (ERP receipts)', color: '#4A5B70' },
          { id: 'Recovered heptane (SRU)', color: '#0F766E' },
          { id: 'Process loop', color: '#1655F2' },
          { id: 'LLE extraction', color: '#3B72F5' },
          { id: 'Crystallization washes', color: '#6E56CF' },
          { id: 'Recovered to SRU', color: '#0F8A45' },
          ...LOSS_SPLIT.map((l) => ({ id: `Loss - ${l.label}`, color: l.colour })),
        ],
      } as Highcharts.SeriesSankeyOptions],
    };
  }, [model]);

  const byUnit: Highcharts.Options = useMemo(() => ({
    chart: { type: 'bar', height: 220 },
    xAxis: { categories: LOSS_SPLIT.map((l) => l.key) },
    yAxis: { title: { text: 'Loss (L)' }, min: 0 },
    legend: { enabled: false },
    tooltip: {
      formatter(this: Highcharts.Point) {
        const l = LOSS_SPLIT[this.index ?? 0];
        return `<b>${l.label}</b><br>${num(this.y, 0)} L (${(l.share * 100).toFixed(0)} % of losses)`;
      },
    },
    series: [{
      type: 'bar',
      name: 'Loss',
      data: LOSS_SPLIT.map((l) => ({ y: model.totalLoss * l.share, color: l.colour })),
      dataLabels: { enabled: true, format: '{y:.0f} L', style: { fontSize: '10px', textOutline: 'none' } },
    }],
  }), [model]);

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-azure-200 bg-azure-50 px-3 py-2 text-xs text-txt-primary">
        <b>This answers OBX&rsquo;s own question:</b> &ldquo;where is heptane actually being lost, and what is solvent loss
        per kilogram of finished MIT?&rdquo; Today that number does not exist &mdash; two of the meters below are
        proposals, not installed instruments.
      </div>

      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <KpiTile
          label="Heptane loss per kg MIT"
          value={num(model.lossPerKg, 1)}
          unit="L/kg"
          target={TARGET_L_PER_KG}
          tone={model.lossPerKg > TARGET_L_PER_KG ? 'warn' : 'ok'}
          hint="Demo model. Documented demo range is 6.8 - 11.5 L/kg against a target of 6.0."
        />
        <KpiTile label="MIT freebase produced" value={num(model.freebaseKg, 0)} unit="kg" hint={`Over ${days} day(s)`} />
        <KpiTile label="Total heptane lost" value={num(model.totalLoss, 0)} unit="L" tone="danger" />
        <KpiTile label="Recovered by SRU" value={num(model.recovered, 0)} unit="L" tone="ok" />
      </KpiStrip>

      <ChartCard
        title="Heptane mass balance"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Fresh + recovered in, losses out by unit operation
            <DemoLimitTag />
          </span>
        }
        info="Demo model derived from MIT freebase output and the documented demo loss split (LLE 38 %, SRU 27 %, filter/dryer 21 %, unaccounted 14 %)."
        height={340}
        options={sankey}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Loss by unit operation"
          subtitle="Where the solvent actually goes"
          height={220}
          options={byUnit}
          tableView={{
            columns: ['Unit operation', 'Loss (L)', 'Share'],
            rows: LOSS_SPLIT.map((l) => [l.label, (model.totalLoss * l.share).toFixed(0), `${(l.share * 100).toFixed(0)} %`]),
          }}
        />

        <Card>
          <CardHeader title="Instrumentation required" subtitle="What has to exist before this KPI is real" />
          <div className="space-y-2 p-4">
            {[
              { tag: 'L1-LLE-01.ORG_FLOW', label: 'Organic (heptane) flow into the LLE skid', state: 'DS4', proposed: true },
              { tag: 'L1-LLE-01.HEP_IN_L', label: 'Heptane totaliser into skid', state: 'DS4', proposed: true },
              { tag: 'L1-SRU-01.REC_TOTAL', label: 'Recovered heptane totaliser', state: 'DS4', proposed: true },
              { tag: 'L1-SRU-01.T01_LVL / T02_LVL', label: 'Fresh / recovered tank levels', state: 'DS3', proposed: false },
              { tag: 'Acumatica', label: 'Fresh heptane purchase receipts', state: 'DS1', proposed: false },
            ].map((r) => (
              <div key={r.tag} className="flex items-start justify-between gap-2 border-b border-line pb-2 last:border-0">
                <div className="min-w-0">
                  <div className="mono text-xs text-txt-primary">{r.tag}</div>
                  <div className="text-2xs text-txt-muted">{r.label}</div>
                </div>
                <div className="shrink-0 text-right">
                  {r.proposed ? (
                    <span className="rounded bg-danger-bg px-1.5 py-0.5 text-2xs font-semibold text-danger">
                      Proposed ({r.state})
                    </span>
                  ) : (
                    <SourceBadge source={r.state === 'DS1' ? 'ERP' : 'Controller'} />
                  )}
                </div>
              </div>
            ))}
            <p className="pt-1 text-2xs text-txt-muted">
              Three of the five inputs need new metering. That is the honest cost of this KPI, and it is exactly the kind
              of scoping decision the onsite walkdown should settle.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
