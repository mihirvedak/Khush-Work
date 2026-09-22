/**
 * Browser smoke test for the OBX demo.
 * Visits every route, fails on console errors / page errors, and captures screenshots.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.env.SHOT_DIR ?? '/tmp/obx-shots';
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['overview', '/'],
  ['timeline', '/timeline'],
  ['downtime', '/downtime'],
  ['quality-loss', '/quality-loss'],
  ['oee', '/oee'],
  ['process', '/process'],
  ['logbooks', '/logbooks'],
  ['genealogy', '/genealogy'],
  ['settings', '/settings'],
];

// Noise we deliberately ignore (dev-server plumbing, not app defects).
const IGNORE = [
  /Download the React DevTools/i,
  /\[vite\] connect(ing|ed)/i,
  /favicon/i,
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const problems = [];
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  const t = m.text();
  if (IGNORE.some((r) => r.test(t))) return;
  problems.push(`[console.${m.type()}] ${page.url()} :: ${t}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${page.url()} :: ${e.message}`));

for (const [name, route] of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  // let Highcharts finish drawing
  await page.waitForTimeout(1200);

  const h1 = await page.locator('h1').first().textContent().catch(() => null);
  const charts = await page.locator('.highcharts-container').count();
  const rows = await page.locator('tbody tr').count();

  // forbidden placeholder values must never reach the screen (definition of done)
  const body = await page.locator('body').innerText();
  for (const bad of ['NaT', 'undefined', 'NaN', 'Machine 1', '[object Object]']) {
    if (body.includes(bad)) problems.push(`[content] ${route} shows forbidden value "${bad}"`);
  }

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`${route.padEnd(15)} h1="${(h1 ?? '').slice(0, 40)}" charts=${charts} rows=${rows}`);
}

await browser.close();

if (problems.length) {
  console.log('\nPROBLEMS:');
  for (const p of [...new Set(problems)]) console.log(' -', p);
  process.exit(1);
}
console.log('\nSmoke OK - no console errors, no forbidden values.');
