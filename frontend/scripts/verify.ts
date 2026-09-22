import { buildDataset, computeOee, ASSETS, FORMS } from '../src/data/index';
const ds = buildDataset();
console.log('meta', new Date(ds.meta.from).toISOString(), '->', new Date(ds.meta.to).toISOString(), 'seed', ds.meta.seed);
console.log('counts: assets', ds.assets.length, 'tags', ds.tags.length, 'batches', ds.batches.length,
  'events', ds.events.length, 'QL', ds.qualityLosses.length, 'dev', ds.deviations.length,
  'logbooks', ds.logbookEntries.length, 'esc', ds.escalations.length, 'forms', FORMS.length);
const f = ds.meta.from, t = ds.meta.to;
for (const id of ['L2-WFE-2M','L2-WFE-1M','L1-CRY-01','L1-CRY-02','L2-ISO-C','L2-RXN-3']) {
  const o = computeOee(ds, { assetIds:[id], from:f, to:t });
  const a = computeOee(ds, { assetIds:[id], from:f, to:t, shift:'A' });
  const b = computeOee(ds, { assetIds:[id], from:f, to:t, shift:'B' });
  const p = (x:number)=> (x*100).toFixed(1);
  console.log(`${id.padEnd(11)} OEE ${p(o.oee)}  A ${p(o.availability)} P ${p(o.performance)} Q ${p(o.quality)} | shiftA ${p(a.oee)} shiftB ${p(b.oee)} | AxPxQ ${p(o.availability*o.performance*o.quality)}`);
}
// story checks
const ongoing = ds.events.filter(e=>e.end===null);
console.log('ongoing events:', ongoing.map(e=>`${e.assetId} ${e.state} ${e.reasonCode} ${new Date(e.start).toISOString()}`).join(' | '));
const untagged = ds.events.filter(e=>e.reasonCode==='U000');
console.log('untagged stops:', untagged.length, untagged.slice(0,3).map(e=>`${e.assetId} ${new Date(e.start).toISOString()}`).join(' | '));
console.log('backfilled:', ds.events.filter(e=>e.backfilled).length);
