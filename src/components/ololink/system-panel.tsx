'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Search as SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ASSETS,
  ASSET_BY_ID,
  KIND_META,
  type Asset,
  type AssetKind,
} from '@/lib/ololink';
import type { OloLinkState, RailId } from '@/hooks/use-ololink';
import { SYSTEM_TABS } from './system-tabs';


const HEALTH_TONE: Record<Asset['health'], string> = {
  NOMINAL: 'text-emerald-300',
  DEGRADED: 'text-amber-300',
  OFFLINE: 'text-rose-300',
};

const TAB_KIND: Partial<Record<RailId, AssetKind>> = {
  leo: 'satellite',
  haps: 'haps',
  drone: 'drone',
  ground: 'ground',
};

function AssetRow({ asset, state }: { asset: Asset; state: OloLinkState }) {
  const links = state.links.filter(
    (l) => l.segment.from === asset.id || l.segment.to === asset.id
  );
  const active = links.filter((l) => l.status === 'ACTIVE').length;
  const onRoute = state.profile.route.includes(asset.id);
  const selected = state.selection?.type === 'asset' && state.selection.id === asset.id;

  return (
    <button
      type="button"
      onClick={() => state.select({ type: 'asset', id: asset.id })}
      className={cn(
        'w-full rounded-[9px] border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-sky-400/40 bg-sky-500/[0.12]'
          : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.05]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium tracking-wide text-foreground">
          {asset.name}
        </span>
        <span className={cn('font-mono text-[9px] uppercase tracking-[0.16em]', HEALTH_TONE[asset.health])}>
          {asset.health}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/65">{asset.role}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/55">
        <span>{asset.region}</span>
        <span>{asset.altKm > 0 ? `${asset.altKm} km` : 'Surface'}</span>
        <span>
          {asset.lat.toFixed(1)}°, {asset.lon.toFixed(1)}°
        </span>
        <span className="text-sky-300/80">
          {active}/{links.length} links
        </span>
        {onRoute && <span className="text-emerald-300/80">on route</span>}
      </div>
    </button>
  );
}

function KindBody({ state, kind }: { state: OloLinkState; kind: AssetKind }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => ASSETS.filter((a) => a.kind === kind), [kind]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        a.region.toLowerCase().includes(s) ||
        a.role.toLowerCase().includes(s)
    );
  }, [all, q]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-[9px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
        <SearchIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`ค้นหาใน ${KIND_META[kind].plural}`}
          className="w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/45"
        />
      </label>

      <div className="space-y-1.5">
        {list.map((a) => (
          <AssetRow key={a.id} asset={a} state={state} />
        ))}
        {list.length === 0 && (
          <p className="py-6 text-center text-[10px] text-muted-foreground/50">ไม่พบอุปกรณ์ที่ตรงกับคำค้นหา</p>
        )}
      </div>
    </div>
  );
}

const SEARCH_KINDS: AssetKind[] = ['satellite', 'haps', 'drone', 'ground', 'customer'];

function SearchBody({ state }: { state: OloLinkState }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<AssetKind | 'all'>('all');

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ASSETS.filter((a) => (kind === 'all' ? true : a.kind === kind)).filter((a) =>
      s
        ? a.name.toLowerCase().includes(s) ||
          a.region.toLowerCase().includes(s) ||
          a.role.toLowerCase().includes(s) ||
          a.id.toLowerCase().includes(s)
        : true
    );
  }, [q, kind]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-[9px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-2">
        <SearchIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา LEO / HAPS / Drone / Ground station"
          className="w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/45"
        />
      </label>

      <div className="flex flex-wrap gap-1">
        {(['all', ...SEARCH_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors',
              kind === k
                ? 'bg-sky-500/[0.16] text-sky-200 ring-1 ring-sky-400/25'
                : 'text-muted-foreground/60 hover:bg-white/[0.05] hover:text-foreground'
            )}
          >
            {k === 'all' ? 'All' : KIND_META[k].label}
          </button>
        ))}
      </div>

      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
        {results.length} results
      </div>

      <div className="space-y-1.5">
        {results.slice(0, 120).map((a) => (
          <AssetRow key={a.id} asset={a} state={state} />
        ))}
        {results.length === 0 && (
          <p className="py-6 text-center text-[10px] text-muted-foreground/50">ไม่พบผลลัพธ์</p>
        )}
      </div>
    </div>
  );
}




function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="flex w-full items-center justify-between rounded-[8px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 transition-colors hover:bg-white/[0.05]"
    >
      <span className="text-[10px] uppercase tracking-[0.14em] text-foreground/85">{label}</span>
      <span
        className={cn(
          'relative h-[14px] w-[26px] rounded-full transition-colors',
          checked ? 'bg-sky-500/60' : 'bg-white/[0.12]'
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[10px] w-[10px] rounded-full bg-white transition-all',
            checked ? 'left-[14px]' : 'left-[2px]'
          )}
        />
      </span>
    </button>
  );
}

function SettingsBody({ state }: { state: OloLinkState }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/50">
          Simulation
        </div>
        <Toggle
          label={state.running ? 'Live orchestration' : 'Operator hold'}
          checked={state.running}
          onChange={() => state.setRunning(!state.running)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/50">
          Layers
        </div>
        {(['weather', 'orbits', 'labels', 'routes'] as const).map((k) => (
          <Toggle key={k} label={k} checked={state.layers[k]} onChange={() => state.toggleLayer(k)} />
        ))}
      </div>

    
    </div>
  );
}

/** LEVEL 3 — slide-out data panel for the active system tab. */
export function SystemPanel({ state }: { state: OloLinkState }) {
  const id = state.panel;
  const meta = SYSTEM_TABS.find((t) => t.id === id);
  const kind = id ? TAB_KIND[id] : undefined;

  return (
    <AnimatePresence>
      {id && meta && (
        <motion.aside
          key={id}
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="pointer-events-auto absolute bottom-3 left-[64px] top-14 z-30 flex w-[340px] flex-col overflow-hidden rounded-2xl border border-white/25 bg-[#050505] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.85)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.26em] text-foreground">
                {kind ? KIND_META[kind].plural : meta.label}
              </h2>
              <p className="mt-1 text-[10px] tracking-wide text-muted-foreground/60">{meta.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => state.setPanel(null)}
              aria-label="Close panel"
              className="rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {kind ? (
              <KindBody state={state} kind={kind} />
            ) : id === 'search' ? (
              <SearchBody state={state} />
            ) : (
              <SettingsBody state={state} />
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export { ASSET_BY_ID };
