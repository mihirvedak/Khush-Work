import { buildDataset, valueAt } from '../src/data/index';
const ds = buildDataset();
console.log('WFE-2M tags:');
ds.tags.filter(t=>t.assetId==='L2-WFE-2M').forEach(t=>console.log('  ', t.key.padEnd(12), t.label.padEnd(34), t.unit.padEnd(6), 'spc='+t.spc, 'golden='+t.golden, 'lsl='+t.lsl, 'usl='+t.usl));
const b = ds.batches.filter(x=>x.assetId==='L2-WFE-2M' && x.end!==null).slice(-1)[0];
console.log('\nsample batch', b.id, 'phases:', b.phases.map(p=>p.name).join(' -> '));
const steady = b.phases.find(p=>p.name==='STEADY FEED');
if (steady) {
  const mid = (steady.start + (steady.end ?? 0))/2;
  for (const k of ['EVAP_PV','VAC_PV','FEED_PV','COND_PV','WIPER_PV','FEED_T','POTENCY','THC_D9']) {
    console.log('  valueAt', k.padEnd(10), valueAt(ds,'L2-WFE-2M',k,mid).toFixed(4));
  }
}
