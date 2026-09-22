/**
 * Faclon Highcharts theme + module registration.
 * Imported once from main.tsx. Highcharts v12+ ESM modules self-register on import.
 */
import Highcharts from 'highcharts';
import 'highcharts/highcharts-more';          // waterfall, arearange (golden tunnel band)
import 'highcharts/modules/xrange';           // machine timeline lanes
import 'highcharts/modules/heatmap';          // asset x day downtime heatmap
import 'highcharts/modules/sankey';           // heptane solvent balance
import 'highcharts/modules/histogram-bellcurve'; // capability histogram + normal fit
import 'highcharts/modules/parallel-coordinates'; // WFE golden operating window
import 'highcharts/modules/pattern-fill';     // state decals (accessibility: never colour-only)
import 'highcharts/modules/annotations';
import 'highcharts/modules/no-data-to-display';
import 'highcharts/modules/accessibility';
import 'highcharts/modules/exporting';
import 'highcharts/modules/offline-exporting';

const css = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** Categorical series palette (design theme §5). */
export const FACLON_COLORS = [
  '#1655F2', '#0F8A45', '#EA7A1A', '#6E56CF', '#0F766E', '#B42318', '#4A5B70', '#B7791F',
];

/** Limit-line styles - encoded by colour AND dash (design theme §1). */
export const LIMIT_STYLE = {
  spec:    { color: '#D92D20', width: 1.5, dashStyle: 'Dash' as const },
  control: { color: '#1655F2', width: 1,   dashStyle: 'Dot' as const },
  target:  { color: '#4A5B70', width: 1,   dashStyle: 'Solid' as const },
  golden:  { color: '#0F8A45', width: 1.5, dashStyle: 'Solid' as const, band: 'rgba(0,234,95,.14)' },
};

/** SVG pattern for a machine-state decal, for xrange points and legend swatches. */
export function decalPattern(decal: string, colour: string) {
  if (decal === 'none') return colour;
  const paths: Record<string, string> = {
    diagonal:      'M 0 8 L 8 0 M -2 2 L 2 -2 M 6 10 L 10 6',
    'back-diagonal': 'M 0 0 L 8 8 M -2 6 L 2 10 M 6 -2 L 10 2',
    horizontal:    'M 0 2 L 8 2 M 0 6 L 8 6',
    cross:         'M 0 0 L 8 8 M 8 0 L 0 8',
  };
  if (decal === 'dots') {
    return {
      pattern: {
        path: { d: 'M 2 2 L 2.1 2', stroke: 'rgba(255,255,255,.85)', strokeWidth: 2.4, strokeLinecap: 'round' },
        width: 5, height: 5, backgroundColor: colour,
      },
    };
  }
  return {
    pattern: {
      path: { d: paths[decal] ?? paths.diagonal, stroke: 'rgba(255,255,255,.7)', strokeWidth: 1.6 },
      width: 8, height: 8, backgroundColor: colour,
    },
  };
}

/** Apply the theme. Re-called on dark-mode toggle so axis colours follow the tokens. */
export function applyFaclonTheme() {
  const label = css('--chart-label', '#4A5B70');
  const axis = css('--chart-axis', '#DCE2EB');
  const split = css('--chart-split', '#EEF2F8');

  Highcharts.setOptions({
    colors: FACLON_COLORS,
    credits: { enabled: false },
    accessibility: { enabled: true },
    lang: { noData: 'No data for this selection', thousandsSep: ',' },
    time: { timezone: 'America/New_York' },  // every axis renders in plant time
    chart: {
      backgroundColor: 'transparent',
      style: { fontFamily: 'Inter, system-ui, sans-serif' },
      spacing: [8, 8, 8, 8],
      animation: { duration: 260 },
    },
    title: { text: undefined },
    noData: { style: { color: label, fontSize: '13px', fontWeight: '400' } },
    xAxis: {
      lineColor: axis,
      tickColor: axis,
      gridLineColor: split,
      labels: { style: { color: label, fontSize: '11px' } },
      // date on the first tick of each day: "Tue 22 Sep" then "06:00"
      dateTimeLabelFormats: {
        millisecond: { main: '%H:%M:%S' },
        second: { main: '%H:%M:%S' },
        minute: { main: '%H:%M' },
        hour: { main: '%H:%M' },
        day: { main: '%a %e %b' },
        week: { main: '%e %b' },
        month: { main: '%b %y' },
        year: { main: '%Y' },
      },
    },
    yAxis: {
      lineWidth: 0,
      gridLineColor: split,
      labels: { style: { color: label, fontSize: '11px' } },
      title: { style: { color: css('--text-muted', '#7A889A'), fontSize: '11px' } },
    },
    tooltip: {
      backgroundColor: '#132335',
      borderWidth: 0,
      borderRadius: 8,
      shadow: false,
      style: { color: '#E8EEF6', fontSize: '12px' },
      useHTML: true,
      outside: true,
    },
    legend: {
      itemStyle: { color: label, fontWeight: '500', fontSize: '12px' },
      itemHoverStyle: { color: css('--text-primary', '#0C1927') },
      symbolRadius: 2,
      symbolHeight: 10,
      symbolWidth: 10,
    },
    plotOptions: {
      series: {
        animation: { duration: 260 },
        states: { inactive: { opacity: 0.35 } },
      },
      line: { marker: { enabled: false }, lineWidth: 1.5 },
      spline: { marker: { enabled: false }, lineWidth: 1.5 },
      column: { borderRadius: 3, borderWidth: 0, groupPadding: 0.12 },
      bar: { borderRadius: 3, borderWidth: 0 },
      pie: { borderWidth: 2, borderColor: css('--bg-surface', '#FFFFFF') },
      area: { lineWidth: 1.5, marker: { enabled: false } },
    },
    exporting: {
      buttons: { contextButton: { enabled: false } },
      fallbackToExportServer: false,
    },
  });
}

export default Highcharts;
