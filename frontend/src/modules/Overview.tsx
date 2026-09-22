import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type Highcharts from 'highcharts';
import { OctagonAlert, Sparkles, ArrowRight, FlaskConical, ClipboardList, Activity } from 'lucide-react';
import { useStore, useRange, DS } from '../store/useStore';
import { computeOee } from '../data/index';
import { selectEvents, selectDeviations, selectQualityLosses, selectLogbookEntries, escalationMetrics } from '../lib/selectors';
import { fmtTs, fmtDuration, fmtDurShort, DAY, startOfEtDay, dayKey } from '../lib/time';
import { pct, num, dash } from '../lib/format';
import { stateMeta } from '../lib/states';
import { Card, CardHeader, Banner, StateChip, SeverityChip, IdLink } from '../components/primitives';
import { KpiTile, KpiStrip, Stat } from '../components/KpiTile';
import { ChartCard } from '../components/Chart';
import type { ShiftId } from '../data/types';

export function Overview() {
  const { line, shift, overlay, now, setBruceOpen } = useStore();
  const range = useRange();
  const nav = useNavigate();
  const shiftArg = shift === 'ALL' ? undefined : (shift as ShiftId);

  const lineAssets = (l: 'L1' | 'L2') => DS.assets.filter((a) => a.line === l).map((a) => a.id);
  const constraints = (l: 'L1' | 'L2') => DS.assets.filter((a) => a.line === l && a.isConstraint).map((a) => a.id);

  const l1 = useMemo(() => computeOee(DS, { assetIds: constraints('L1'), from: range.from, to: range.to, shift: shiftArg }), [range.from, range.to, shift]);
  const l2 = useMemo(() => computeOee(DS, { assetIds: constraints('L2'), from: range.from, to: range.to, shift: shiftArg }), [range.from, range.to, shift]);
  const plantOee = (l1.oee * l1.hours.ppt + l2.oee * l2.hours.ppt) / ((l1.hours.ppt + l2.hours.ppt) || 1);

  const allIds = DS.assets.filter((a) => line === 'ALL' || a.line === line).map((a) => a.id);

  // live state per asset at demo-now
  const live = useMemo(() => {
    return DS.assets
      .filter((a) => line === 'ALL' || a.line === line)
      .map((a) => {
        const ev = DS.events.filter((e) => e.assetId === a.id && e.start <= now && (e.end ?? Infinity) > now).pop();
        return { asset: a, ev };
      });
  }, [line, now]);

  const downNow = live.filter((x) => x.ev && (x.ev.state === 'DOWN' || x.ev.state === 'IDLE' || x.ev.state === 'HOLD'));
  const runningNow = live.filter((x) => x.ev?.state === 'RUN');

  const openDevs = useMemo(
    () => selectDeviations(DS, { assetIds: allIds, from: range.from, to: range.to }, overlay).filter((d) => d.status !== 'Closed'),
    [allIds, range.from, range.to, overlay],
  );

  const holds = useMemo(
    () => selectQualityLosses(DS, { assetIds: allIds, from: range.from, to: range.to }, overlay).filter((q) => q.status === 'Open' || q.status === 'On Hold'),
    [allIds, range.from, range.to, overlay],
  );

  const logs = useMemo(
    () => selectLogbookEntries(DS, { assetIds: allIds, from: range.from, to: range.to }, overlay, now),
    [allIds, range.from, range.to, overlay, now],
  );
  const overdueLogs = logs.filter((l) => l.uiStatus === 'Overdue');

  const esc = escalationMetrics(DS.escalations, overlay);

  const events = useMemo(
    () => selectEvents(DS, { assetIds: allIds, from: range.from, to: range.to, shift }, overlay, now),
    [allIds, range.from, range.to, shift, overlay, now],
  );
  const untagged = events.filter((e) => e.reasonCode === 'U000');

  // the opening story: WFE-2M ongoing downtime
  const headline = events.find((e) => e.ongoing && e.state === 'DOWN' && e.assetId === 'L2-WFE-2M')
    ?? events.find((e) => e.ongoing && e.state === 'DOWN');

  // 14-day OEE trend per line
  const trend = useMemo(() => {
    const days: string[] = [];
    const a: number[] = [];
    const b: number[] = [];
    let d = startOfEtDay(now) - 13 * DAY;
    while (d <= now) {
      const to = Math.min(d + DAY, now);
      days.push(dayKey(d).slice(5));
      a.push(computeOee(DS, { assetIds: constraints('L1'), from: d, to }).oee * 100);
      b.push(computeOee(DS, { assetIds: constraints('L2'), from: d, to }).oee * 100);
      d += DAY;
    }
    return { days, a, b };
  }, [now]);

  const trendOptions: Highcharts.Options = useMemo(() => ({
    chart: { type: 'line', height: 220 },
    xAxis: { categories: trend.days, labels: { style: { fontSize: '9px' } } },
    yAxis: { title: { text: 'OEE %' }, min: 0, max: 100, plotLines: [{ value: 60, color: '#7A889A', width: 1, dashStyle: 'Dash', label: { text: 'target 60 %', style: { fontSize: '9px', color: '#7A889A' } } }] },
    tooltip: { shared: true, valueSuffix: ' %', valueDecimals: 1 },
    series: [
      { type: 'line', name: 'L1 Kratom / MIT', data: trend.a, color: '#0F766E' },
      { type: 'line', name: 'L2 Bulk Cannabinoids', data: trend.b, color: '#1655F2' },
    ],
  }), [trend]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-title font-bold">Plant Overview</h1>
          <p className="lbl mt-0.5">Both lines, one screen &mdash; live state, today&rsquo;s OEE, and everything that needs attention.</p>
        </div>
        <span className="text-2xs text-txt-muted">Plant time {fmtTs(now)} ET &middot; {range.label}</span>
      </header>

      {headline && (
        <Banner
          tone="danger"
          icon={<OctagonAlert size={16} />}
          action={
            <button type="button" onClick={() => nav(`/timeline?assets=${headline.assetId}`)} className="inline-flex items-center gap-1 rounded-ctl bg-danger px-3 py-1.5 text-xs font-semibold text-white">
              Open timeline <ArrowRight size={12} />
            </button>
          }
        >
          <b>{headline.assetId} has been down since {fmtTs(headline.start)} ET ({fmtDuration(now - headline.start)})</b>
          {headline.reasonCode && headline.reasonCode !== 'U000' && (
            <> &mdash; {headline.reasonCode} {DS.reasons.find((r) => r.code === headline.reasonCode)?.label}, tagged by {dash(headline.taggedBy)}</>
          )}
          {headline.remarks && <div className="mt-0.5 text-xs text-txt-secondary">{headline.remarks}</div>}
        </Banner>
      )}

      <KpiStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Plant OEE" value={pct(plantOee)} target={60} deltaSuffix="%" hint="PPT-weighted average of both line OEEs" onClick={() => nav('/oee')} />
        <KpiTile label="Running now" value={`${runningNow.length}/${live.length}`} tone="ok" />
        <KpiTile label="Stopped now" value={downNow.length} tone={downNow.length ? 'danger' : 'default'} onClick={() => nav('/downtime')} />
        <KpiTile label="Open deviations" value={openDevs.length} tone={openDevs.length ? 'warn' : 'default'} onClick={() => nav('/process?tab=deviations')} />
        <KpiTile label="Material on hold" value={num(holds.reduce((s, h) => s + h.qtyKg, 0), 1)} unit="kg" tone={holds.length ? 'warn' : 'default'} onClick={() => nav('/quality-loss')} />
        <KpiTile label="Overdue logbooks" value={overdueLogs.length} tone={overdueLogs.length ? 'danger' : 'default'} onClick={() => nav('/logbooks')} />
      </KpiStrip>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <LineCard
          title="L1 Kratom / MIT"
          subtitle="Biomass → extraction → LLE → crystallization → freebase → acetate salt"
          oee={l1}
          constraint="L1-CRY-01 / CRY-02"
          assets={lineAssets('L1')}
          live={live}
          extra={<><Stat label="Yield MIT" value="68.4%" /><Stat label="Heptane" value="8.9 L/kg" tone="warn" title="Demo model, target 6.0 L/kg" /></>}
          onClick={() => nav('/oee?line=L1')}
        />
        <LineCard
          title="L2 Bulk Cannabinoids"
          subtitle="Crude → 1M WFE → 2M WFE → isolation or D8 reaction → wash / dry"
          oee={l2}
          constraint="L2-WFE-2M"
          assets={lineAssets('L2')}
          live={live}
          extra={<><Stat label="Yield CBD" value="71.2%" /><Stat label="Constraint OEE" value={pct(l2.oee)} tone={l2.oee < 0.5 ? 'danger' : 'warn'} /></>}
          onClick={() => nav('/oee?line=L2')}
        />

        <Card className="flex max-h-[330px] flex-col">
          <CardHeader title="Needs attention" subtitle={`${downNow.length + openDevs.length + overdueLogs.length + untagged.length} open items`} />
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {downNow.slice(0, 4).map(({ asset, ev }) => (
              <AttentionRow
                key={asset.id}
                icon={<OctagonAlert size={13} className="text-danger" />}
                title={`${asset.id} ${stateMeta(ev!.state).label.toLowerCase()}`}
                meta={`${fmtDurShort(now - ev!.start)} · ${ev!.reasonCode && ev!.reasonCode !== 'U000' ? `${ev!.reasonCode} ${DS.reasons.find((r) => r.code === ev!.reasonCode)?.label}` : 'untagged'}`}
                onClick={() => nav(`/timeline?assets=${asset.id}`)}
              />
            ))}
            {openDevs.slice(0, 4).map((d) => (
              <AttentionRow
                key={d.id}
                icon={<Activity size={13} className="text-warn" />}
                title={`${d.id} ${d.tagKey} on ${d.assetId}`}
                meta={`${d.limitType} limit · worst ${num(d.worst, 2)}`}
                right={<SeverityChip severity={d.severity} />}
                onClick={() => nav('/process?tab=deviations')}
              />
            ))}
            {holds.slice(0, 3).map((h) => (
              <AttentionRow
                key={h.id}
                icon={<FlaskConical size={13} className="text-warn" />}
                title={`${h.id} · ${num(h.qtyKg, 1)} kg on hold`}
                meta={`${h.reasonCode} ${h.reasonLabel}`}
                onClick={() => nav('/quality-loss')}
              />
            ))}
            {overdueLogs.slice(0, 3).map((l) => (
              <AttentionRow
                key={l.id}
                icon={<ClipboardList size={13} className="text-danger" />}
                title={`${l.formNo} overdue on ${l.assetId}`}
                meta={`due ${fmtTs(l.dueAt)}`}
                onClick={() => nav('/logbooks')}
              />
            ))}
            {untagged.length > 0 && (
              <AttentionRow
                icon={<OctagonAlert size={13} className="text-warn" />}
                title={`${untagged.length} untagged stop${untagged.length === 1 ? '' : 's'}`}
                meta="Reason attribution missing - tag before shift close"
                onClick={() => nav('/downtime')}
              />
            )}
            {esc.open > 0 && (
              <AttentionRow
                icon={<OctagonAlert size={13} className="text-danger" />}
                title={`${esc.open} open escalations`}
                meta={`${esc.byLevel[3] + esc.byLevel[4]} at L3/L4 · SLA ${pct(esc.slaAdherence)}`}
                onClick={() => nav('/logbooks?tab=escalations')}
              />
            )}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="OEE trend - last 14 days"
          subtitle="Line OEE = constraint asset OEE"
          height={220}
          options={trendOptions}
        />

        <Card className="flex flex-col">
          <CardHeader title="Bruce AI" subtitle="Future phase - not part of Phase 1" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="flex items-start gap-2 rounded-ctl border border-azure-200 bg-azure-50 px-3 py-2">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-azure-600" />
              <p className="text-xs text-txt-secondary">
                Once the data foundation is trusted and contextualised, natural-language questions become possible:
              </p>
            </div>
            <ul className="space-y-1.5 text-xs">
              {[
                'Why is WFE-2M worse on the night shift?',
                'Where are we actually losing hours?',
                'Do WFE operating conditions explain yield variation?',
              ].map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => setBruceOpen(true)}
                    className="w-full rounded-ctl border border-line px-2.5 py-1.5 text-left text-txt-secondary hover:border-azure-200 hover:bg-azure-50"
                  >
                    &ldquo;{q}&rdquo;
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setBruceOpen(true)}
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-ctl bg-gradient-to-br from-[#6E56CF] to-[#1655F2] px-3 py-2 text-xs font-semibold text-white"
            >
              <Sparkles size={13} /> Ask Bruce
            </button>
            <p className="mt-auto text-2xs text-txt-muted">
              Deliberately deferred: OBX said trusted, contextualised data first &mdash; AI once the dataset can
              actually support it.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LineCard({
  title, subtitle, oee, constraint, assets, live, extra, onClick,
}: {
  title: string; subtitle: string; oee: ReturnType<typeof computeOee>; constraint: string;
  assets: string[]; live: { asset: { id: string }; ev?: { state: string } }[]; extra?: React.ReactNode; onClick: () => void;
}) {
  const mine = live.filter((l) => assets.includes(l.asset.id));
  const tone = oee.oee >= 0.6 ? '#1E9E5A' : oee.oee >= 0.45 ? '#B7791F' : '#D92D20';

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader title={title} subtitle={subtitle} right={
        <button type="button" onClick={onClick} className="rounded-ctl border border-line px-2 py-1 text-xs text-txt-secondary hover:bg-subtle">
          Drill
        </button>
      } />
      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-kpi font-semibold tnum" style={{ color: tone }}>{pct(oee.oee)}</span>
          <span className="text-2xs text-txt-muted">constraint {constraint}</span>
        </div>
        <div className="mt-2 flex gap-4">
          <Stat label="A" value={pct(oee.availability)} />
          <Stat label="P" value={pct(oee.performance)} />
          <Stat label="Q" value={pct(oee.quality)} />
          {extra}
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {mine.map(({ asset, ev }) => (
            <span
              key={asset.id}
              title={`${asset.id} - ${ev ? stateMeta(ev.state as never).label : 'no data'}`}
              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px]"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ev ? stateMeta(ev.state as never).fill : '#E3E8EF' }} aria-hidden />
              <span className="mono">{asset.id.replace(/^L\d-/, '')}</span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AttentionRow({
  icon, title, meta, right, onClick,
}: { icon?: React.ReactNode; title: string; meta: string; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2 rounded-ctl border border-line px-2.5 py-1.5 text-left hover:bg-subtle"
      >
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-txt-primary">{title}</span>
          <span className="block truncate text-2xs text-txt-muted">{meta}</span>
        </span>
        {right}
      </button>
    </li>
  );
}

export { StateChip, IdLink };
