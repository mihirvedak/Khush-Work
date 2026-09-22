import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useStore, useRange, DS } from '../store/useStore';
import { Card, CardHeader } from '../components/primitives';
import { LiveTab } from './process/LiveTab';
import { TrendsTab } from './process/TrendsTab';
import { SpcTab } from './process/SpcTab';
import { GoldenTab } from './process/GoldenTab';
import { DeviationsTab } from './process/DeviationsTab';
import { SolventTab } from './process/SolventTab';

const TABS = [
  { id: 'live', label: 'Live' },
  { id: 'trends', label: 'Trends' },
  { id: 'spc', label: 'SPC & capability' },
  { id: 'golden', label: 'Golden tunnel' },
  { id: 'deviations', label: 'Deviation log' },
  { id: 'solvent', label: 'Solvent balance' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function Process() {
  const { line, assetIds } = useStore();
  const range = useRange();
  const [params, setParams] = useSearchParams();

  const tab = (params.get('tab') as TabId) ?? 'live';
  const setTab = (t: TabId) => {
    const n = new URLSearchParams(params);
    n.set('tab', t);
    setParams(n, { replace: true });
  };

  // assets that actually carry process tags
  const tagged = useMemo(() => {
    const withTags = new Set(DS.tags.map((t) => t.assetId));
    return DS.assets.filter((a) => withTags.has(a.id) && (line === 'ALL' || a.line === line));
  }, [line]);

  // default to the story asset (WFE-2M), else the first filtered asset
  const urlAsset = params.get('asset');
  const preferred = assetIds[0] ?? urlAsset ?? (tagged.some((a) => a.id === 'L2-WFE-2M') ? 'L2-WFE-2M' : tagged[0]?.id);
  const [assetId, setAssetId] = useState<string>(preferred);

  // if the line filter excludes the selected asset, fall back to the first available one
  useEffect(() => {
    if (tagged.length && !tagged.some((a) => a.id === assetId)) setAssetId(tagged[0].id);
  }, [tagged, assetId]);

  const asset = tagged.find((a) => a.id === assetId) ?? tagged[0];
  const effectiveId = asset?.id;

  const selectAsset = (id: string) => {
    setAssetId(id);
    const n = new URLSearchParams(params);
    n.set('asset', id);
    setParams(n, { replace: true });
  };

  const visibleTabs = TABS.filter((t) => t.id !== 'solvent' || line !== 'L2');

  if (!asset) {
    return (
      <Card className="p-6">
        <p className="text-sm text-txt-secondary">No instrumented assets match the current line filter.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-title font-bold">Process Parameters</h1>
        <p className="lbl mt-0.5">
          The evidence layer: live tags, control charts, capability, the golden operating envelope and every excursion.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Asset"
          subtitle={`${asset.id} · ${asset.name} · ${asset.area}`}
          right={
            <select
              value={effectiveId}
              onChange={(e) => selectAsset(e.target.value)}
              className="rounded-ctl border border-line bg-surface px-2 py-1.5 text-xs"
              aria-label="Select asset"
            >
              {tagged.map((a) => (
                <option key={a.id} value={a.id}>{a.id} - {a.name}</option>
              ))}
            </select>
          }
        />
        <nav className="flex flex-wrap gap-1 border-b border-line px-3 pt-2" role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'rounded-t px-3 py-2 text-xs font-medium',
                tab === t.id ? 'border-b-2 border-azure-600 text-azure-600' : 'text-txt-secondary hover:text-txt-primary',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-4">
          {tab === 'live' && <LiveTab assetId={asset.id} />}
          {tab === 'trends' && <TrendsTab assetId={asset.id} from={range.from} to={range.to} />}
          {tab === 'spc' && <SpcTab assetId={asset.id} from={range.from} to={range.to} />}
          {tab === 'golden' && <GoldenTab assetId={asset.id} />}
          {tab === 'deviations' && <DeviationsTab from={range.from} to={range.to} />}
          {tab === 'solvent' && <SolventTab from={range.from} to={range.to} />}
        </div>
      </Card>
    </div>
  );
}
