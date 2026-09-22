import { buildDataset } from '../src/data/index';
const ds = buildDataset();
const byAsset = new Map<string, Set<string>>();
for (const b of ds.batches) {
  const fam = b.assetId.replace(/-\d+$/,'').replace(/-(1M|2M)$/,'-WFE');
  if (!byAsset.has(fam)) byAsset.set(fam, new Set());
  Object.keys(b.metrics ?? {}).forEach(k => byAsset.get(fam)!.add(k));
}
for (const [k,v] of byAsset) console.log(k.padEnd(14), [...v].join(', '));
const w = ds.batches.find(b=>b.assetId==='L2-WFE-2M' && b.end!==null);
console.log('\nWFE-2M sample metrics:', JSON.stringify(w?.metrics));
const iso = ds.batches.find(b=>b.assetId.startsWith('L2-ISO') && b.end!==null);
console.log('ISO sample metrics:', JSON.stringify(iso?.metrics));
const rxn = ds.batches.find(b=>b.assetId.startsWith('L2-RXN') && b.end!==null);
console.log('RXN sample metrics:', JSON.stringify(rxn?.metrics));
const cry = ds.batches.find(b=>b.assetId.startsWith('L1-CRY') && b.end!==null);
console.log('CRY sample metrics:', JSON.stringify(cry?.metrics));
