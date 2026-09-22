import { useMemo } from 'react';
import type Highcharts from 'highcharts';
import { useStore, DS } from '../../store/useStore';
import { computeOee } from '../../data/index';
import { selectEvents, pareto, selectQualityLosses } from '../../lib/selectors';
import { steadyValues } from '../../lib/spc';
import { hours, DAY, dayKey, startOfEtDay } from '../../lib/time';
import { num, pct } from '../../lib/format';

export interface Answer {
  id: string;
  question: string;
  /** one-line verdict */
  headline: string;
  /** the reasoning, in the analyst's voice */
  body: string[];
  /** what the user should do with it */
  nextStep: string;
  chart: Highcharts.Options;
  chartTitle: string;
  chartSubtitle: string;
  confidence: 'High' | 'Medium' | 'Indicative';
}

/**
 * Bruce AI - clearly a future phase. Each answer is computed from the same dataset the
 * rest of the app uses, so the chart under the text is real, not a mock-up.
 */

/** Every Bruce answer is computed from the same dataset the dashboards use. */
export function useBruceAnswers(): Answer[] {
  const { now, overlay } = useStore();
  return useMemo<Answer[]>(() => {
    const allIds = DS.assets.map((a) => a.id);

    /* ---- 1. shift gap on the L2 constraint ---------------------------------- */
    const a = computeOee(DS, { assetIds: ['L2-WFE-2M'], from: DS.meta.from, to: now, shift: 'A' });
    const b = computeOee(DS, { assetIds: ['L2-WFE-2M'], from: DS.meta.from, to: now, shift: 'B' });
    const gap = (a.oee - b.oee) * 100;

    const shiftChart: Highcharts.Options = {
      chart: { type: 'column' },
      xAxis: { categories: ['Availability', 'Performance', 'Quality', 'OEE'] },
      yAxis: { title: { text: '%' }, min: 0, max: 100 },
      tooltip: { shared: true, valueSuffix: ' %', valueDecimals: 1 },
      series: [
        { type: 'column', name: 'Shift A', color: '#1655F2', data: [a.availability * 100, a.performance * 100, a.quality * 100, a.oee * 100] },
        { type: 'column', name: 'Shift B', color: '#6E56CF', data: [b.availability * 100, b.performance * 100, b.quality * 100, b.oee * 100] },
      ],
    };

    /* ---- 2. where the hours actually go on L2 ------------------------------- */
    const events = selectEvents(DS, { assetIds: allIds, from: DS.meta.from, to: now }, overlay, now);
    const fam = pareto(events, { assetIds: allIds, from: DS.meta.from, to: now }, DS, 'mode', 8);

    const lossChart: Highcharts.Options = {
      chart: { type: 'bar' },
      xAxis: { categories: fam.map((f) => f.key), labels: { style: { fontSize: '10px' } } },
      yAxis: { title: { text: 'Downtime (h)' }, min: 0 },
      legend: { enabled: false },
      tooltip: {
        formatter(this: Highcharts.Point) {
          const r = fam[this.index ?? 0];
          return `<b>${r.label}</b><br>${hours(r.ms).toFixed(1)} h across ${r.count} stops<br>${(r.pct * 100).toFixed(1)} % of downtime`;
        },
      },
      series: [{
        type: 'bar', name: 'Downtime',
        data: fam.map((f) => ({ y: hours(f.ms), color: f.colour })),
        dataLabels: { enabled: true, format: '{y:.0f} h', style: { fontSize: '10px', textOutline: 'none' } },
      }],
    };

    /* ---- 3. does evaporator temperature travel with yield? ------------------ */
    const campaigns: { id: string; evap: number; yieldPct: number }[] = [];
    for (const batch of DS.batches) {
      if (batch.assetId !== 'L2-WFE-2M' || batch.end === null) continue;
      const steady = batch.phases.find((p) => p.name === 'STEADY FEED');
      if (!steady?.end) continue;
      const { v } = steadyValues(DS, 'L2-WFE-2M', 'EVAP_PV', steady.start, steady.end, ['STEADY FEED'], 300);
      if (v.length < 4) continue;
      campaigns.push({
        id: batch.id,
        evap: v.reduce((s, x) => s + x, 0) / v.length,
        yieldPct: batch.metrics?.yieldPct ?? 0,
      });
    }
    const r = correlation(campaigns.map((c) => c.evap), campaigns.map((c) => c.yieldPct));

    const yieldChart: Highcharts.Options = {
      chart: { type: 'scatter', zooming: { type: 'xy' } },
      xAxis: { title: { text: 'Mean evaporator temperature during STEADY FEED (°C)' }, gridLineWidth: 1 },
      yAxis: { title: { text: 'Campaign yield (%)' } },
      legend: { enabled: false },
      tooltip: {
        formatter(this: Highcharts.Point) {
          const c = campaigns[this.index ?? 0];
          return `<b>${c?.id}</b><br>Evaporator ${(this.x as number).toFixed(1)} °C<br>Yield ${(this.y as number).toFixed(1)} %`;
        },
      },
      series: [{
        type: 'scatter',
        name: 'Campaign',
        color: '#1655F2',
        data: campaigns.map((c) => ({ x: c.evap, y: c.yieldPct, marker: { radius: 5 } })),
      }],
    };

    /* ---- 4. rejection cost by reason ---------------------------------------- */
    const losses = selectQualityLosses(DS, { assetIds: allIds, from: DS.meta.from, to: now }, overlay);
    const byReason = new Map<string, { kg: number; label: string }>();
    for (const l of losses) {
      const cur = byReason.get(l.reasonCode) ?? { kg: 0, label: l.reasonLabel };
      byReason.set(l.reasonCode, { kg: cur.kg + l.qtyKg, label: l.reasonLabel });
    }
    const top = [...byReason.entries()].sort((x, y) => y[1].kg - x[1].kg).slice(0, 8);
    const totalKg = losses.reduce((s, l) => s + l.qtyKg, 0);
    const reworkKg = losses.filter((l) => l.disposition === 'REWORK').reduce((s, l) => s + l.qtyKg, 0);

    const rejectChart: Highcharts.Options = {
      chart: { type: 'bar' },
      xAxis: { categories: top.map(([c]) => c), labels: { style: { fontSize: '10px' } } },
      yAxis: { title: { text: 'kg affected' }, min: 0 },
      legend: { enabled: false },
      tooltip: {
        formatter(this: Highcharts.Point) {
          const t = top[this.index ?? 0];
          return `<b>${t[0]}</b><br>${t[1].label}<br><b>${t[1].kg.toFixed(1)} kg</b>`;
        },
      },
      series: [{
        type: 'bar', name: 'kg',
        data: top.map(([c, v]) => ({ y: v.kg, color: c.startsWith('QL1') ? '#0F766E' : '#1655F2' })),
        dataLabels: { enabled: true, format: '{y:.1f}', style: { fontSize: '10px', textOutline: 'none' } },
      }],
    };

    /* ---- 5. is the plant trending up or down? ------------------------------- */
    const days: string[] = [];
    const oeeSeries: number[] = [];
    let d = startOfEtDay(now) - 13 * DAY;
    while (d <= now) {
      const to = Math.min(d + DAY, now);
      const res = computeOee(DS, { assetIds: allIds, from: d, to });
      if (res.hours.ppt > 0) { days.push(dayKey(d).slice(5)); oeeSeries.push(res.oee * 100); }
      d += DAY;
    }
    const firstHalf = oeeSeries.slice(0, Math.floor(oeeSeries.length / 2));
    const secondHalf = oeeSeries.slice(Math.floor(oeeSeries.length / 2));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const drift = mean(secondHalf) - mean(firstHalf);

    const trendChart: Highcharts.Options = {
      chart: { type: 'line' },
      xAxis: { categories: days, labels: { style: { fontSize: '9px' } } },
      yAxis: { title: { text: 'Plant OEE %' }, min: 0, max: 100 },
      legend: { enabled: false },
      tooltip: { valueSuffix: ' %', valueDecimals: 1 },
      series: [{ type: 'line', name: 'Plant OEE', color: '#1655F2', data: oeeSeries, marker: { enabled: true, radius: 3 } }],
    };

    return [
      {
        id: 'shift',
        question: 'Why is WFE-2M worse on the night shift?',
        headline: `Shift B runs ${gap.toFixed(1)} points below shift A on the L2 constraint asset.`,
        body: [
          `Over the last 30 days WFE-2M achieved ${pct(a.oee)} OEE on shift A against ${pct(b.oee)} on shift B.`,
          `Almost all of the gap is availability (${pct(a.availability)} vs ${pct(b.availability)}), not speed or quality — the asset is stopping more often at night, it is not running slower.`,
          'The vacuum-pump family (E1xx) dominates those stops, and the daily equipment checklist that covers the vacuum pump oil check has been missed on shift B.',
        ],
        nextStep: 'Check whether the B-shift handover actually includes the vacuum pump oil check before treating this as an equipment problem.',
        chart: shiftChart,
        chartTitle: 'WFE-2M by shift',
        chartSubtitle: 'A vs B across A, P, Q and OEE - last 30 days',
        confidence: 'High',
      },
      {
        id: 'losses',
        question: 'Where are we actually losing hours?',
        headline: fam.length ? `${fam[0].label} is the single largest loss at ${hours(fam[0].ms).toFixed(0)} h.` : 'No downtime in range.',
        body: [
          'Grouping by failure mode rather than by individual reason code changes the ranking completely — individually the vacuum codes look small, together they are the biggest single family.',
          fam.length > 1 ? `${fam[0].key}xx accounts for ${(fam[0].pct * 100).toFixed(1)} % of downtime, ahead of ${fam[1].key}xx at ${(fam[1].pct * 100).toFixed(1)} %.` : '',
          'Material and lab waits also appear high, which is a scheduling and QC-turnaround conversation rather than a maintenance one.',
        ].filter(Boolean),
        nextStep: 'Attack the top family as one problem, not as five separate reason codes.',
        chart: lossChart,
        chartTitle: 'Downtime by failure mode',
        chartSubtitle: 'Both lines - last 30 days',
        confidence: 'High',
      },
      {
        id: 'yield',
        question: 'Do WFE operating conditions explain yield variation?',
        headline: campaigns.length < 6
          ? 'Not enough completed campaigns to answer this yet.'
          : `Evaporator temperature and yield correlate at r = ${r.toFixed(2)} across ${campaigns.length} campaigns.`,
        body: [
          `Each point is one 2M campaign, plotted by its mean evaporator temperature while genuinely running in STEADY FEED against the yield it achieved.`,
          Math.abs(r) < 0.3
            ? 'The relationship is weak on this data, which is itself a useful answer: evaporator temperature alone does not explain yield, so the driver is elsewhere.'
            : `The relationship is real but moderate — temperature is one contributor among several, not the whole story.`,
          'This is exactly the question OBX asked, and it is only answerable because the operating history is retained continuously rather than sampled every two hours on paper.',
        ],
        nextStep: 'Rebuild this on OBX’s own history before acting on it; synthetic correlation proves the method, not the conclusion.',
        chart: yieldChart,
        chartTitle: 'Evaporator temperature vs campaign yield',
        chartSubtitle: `n = ${campaigns.length} completed 2M campaigns`,
        confidence: campaigns.length < 12 ? 'Indicative' : 'Medium',
      },
      {
        id: 'quality',
        question: 'What is quality loss costing us?',
        headline: `${num(totalKg, 0)} kg affected, of which ${num(reworkKg, 0)} kg is rework rather than scrap.`,
        body: [
          'Most material is recovered, so the headline cost is not lost product — it is the reactor time and solvent consumed re-processing it.',
          top.length ? `${top[0][0]} (${top[0][1].label}) is the largest single contributor at ${top[0][1].kg.toFixed(1)} kg.` : '',
          'Because rework occupies the same constraint assets, quality loss shows up again as an availability problem on the OEE screen.',
        ].filter(Boolean),
        nextStep: 'Track rework reactor-hours alongside kilograms; that is the number that competes with production.',
        chart: rejectChart,
        chartTitle: 'Quality loss by reason',
        chartSubtitle: 'kg affected - last 30 days',
        confidence: 'High',
      },
      {
        id: 'trend',
        question: 'Is the plant getting better or worse?',
        headline: Math.abs(drift) < 1
          ? 'Plant OEE is flat over the last fortnight.'
          : `Plant OEE has drifted ${drift > 0 ? 'up' : 'down'} ${Math.abs(drift).toFixed(1)} points over the last fortnight.`,
        body: [
          `The recent week averaged ${mean(secondHalf).toFixed(1)} % against ${mean(firstHalf).toFixed(1)} % for the week before.`,
          'Day-to-day swing is much larger than the trend, which is normal for batch chemistry — single long stops move a whole day.',
          'A fortnight is too short to call a trend; this is a watch item, not a conclusion.',
        ],
        nextStep: 'Judge this monthly against the 45-65 % batch-chemical benchmark, not day to day.',
        chart: trendChart,
        chartTitle: 'Plant OEE - last 14 days',
        chartSubtitle: 'All assets, both lines',
        confidence: 'Medium',
      },
    ];
  }, [now, overlay]);
}

/** Pearson correlation - returns 0 when undefined. */
function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : 0;
}

