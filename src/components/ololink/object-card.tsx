'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, Crosshair, ArrowDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ASSET_BY_ID, STATUS_META, TECH_META, type LinkState, type Segment } from '@/lib/ololink';
import { STORAGE_TB, chainForAsset } from '@/lib/chain';
import type { OloLinkState } from '@/hooks/use-ololink';

function Line({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/[0.04] py-1.5 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</span>
      <span className={cn('font-mono text-[11px] tabular-nums text-foreground', tone)}>{value}</span>
    </div>
  );
}

/** Full data path through the network, as an operator reads it. */
function PathChain({
  segments,
  state,
  activeId,
}: {
  segments: Segment[];
  state: OloLinkState;
  activeId?: string;
}) {
  if (segments.length === 0) return null;
  const nodes = [segments[0]!.from, ...segments.map((s) => s.to)];

  return (
    <div className="mt-3">
      <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60">Data path</div>
      <div className="mt-2 space-y-0.5">
        {nodes.map((id, i) => {
          const seg = segments[i];
          const meta = seg ? TECH_META[seg.tech] : null;
          return (
            <div key={id}>
              <button
                type="button"
                onClick={() => state.select({ type: 'asset', id })}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                <span className="truncate text-[11px] text-foreground/90">{ASSET_BY_ID[id]?.name}</span>
              </button>
              {seg && meta && (
                <button
                  type="button"
                  onClick={() => state.select({ type: 'link', id: seg.id })}
                  className={cn(
                    'ml-[3px] flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.04]',
                    seg.id === activeId ? 'opacity-100' : 'opacity-70'
                  )}
                >
                  <ArrowDown className="h-2.5 w-2.5 text-muted-foreground/60" />
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.16em]"
                    style={{ color: meta.color }}
                  >
                    {meta.short}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Storage({ used }: { used: number }) {
  const pct = Math.min(100, (used / STORAGE_TB) * 100);
  return (
    <div className="mt-3">
      <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60">Storage</div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700', pct > 85 ? 'bg-rose-400' : 'bg-sky-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>Used {used.toFixed(2)} TB</span>
        <span>Free {(STORAGE_TB - used).toFixed(2)} TB</span>
      </div>
    </div>
  );
}

function NodeLink({ state, id, label }: { state: OloLinkState; id?: string | undefined; label: string }) {
  const name = id ? ASSET_BY_ID[id]?.name : undefined;
  if (!id || !name) return <Line label={label} value="No contact" tone="text-muted-foreground" />;
  return (
    <div className="flex items-baseline justify-between border-b border-white/[0.04] py-1.5 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</span>
      <button
        type="button"
        onClick={() => state.select({ type: 'asset', id })}
        className="font-mono text-[11px] text-sky-300 transition-colors hover:text-sky-200"
      >
        {name}
      </button>
    </div>
  );
}

function AssetBody({ state, id }: { state: OloLinkState; id: string }) {
  const asset = ASSET_BY_ID[id];
  if (!asset) return null;
  const site = chainForAsset(state.chains, id);

  return (
    <>
      <Line label="Name" value={asset.name} />
      {asset.kind === 'haps' && site && (
        <>
          <Line label="Data received" value={`${site.chain.hapsReceivedTb.toFixed(2)} TB`} />
          <Storage used={site.chain.hapsStoredTb} />
          <NodeLink state={state} id={site.site.droneId} label="Connected drone" />
        </>
      )}

      {asset.kind === 'drone' && site && (
        <>
          <Line label="Data received" value={`${site.chain.droneReceivedTb.toFixed(2)} TB`} />
          <Line label="Mode" value={site.chain.droneMode} tone="text-sky-300" />
          <NodeLink state={state} id={site.site.groundId} label="Connected ground station" />
        </>
      )}

      {asset.kind === 'ground' && site && (
        <>
          <NodeLink state={state} id={site.site.droneId} label="Connected drone" />
          <Line
            label="Receiving"
            value={site.chain.groundReceiving ? 'RECEIVING' : 'IDLE'}
            tone={site.chain.groundReceiving ? 'text-emerald-300' : 'text-muted-foreground'}
          />
          <Line label="Data received" value={`${site.chain.groundReceivedTb.toFixed(2)} TB`} />
        </>
      )}
    </>
  );
}


function LinkBody({ link, state }: { link: LinkState; state: OloLinkState }) {
  const meta = TECH_META[link.segment.tech];
  const onRoute = state.route.some((s) => s.id === link.segment.id);

  return (
    <>
      <Line label="Technology" value={meta.label} />
      <Line
        label="Route status"
        value={link.status}
        tone={STATUS_META[link.status].tone}
      />
      <Line label="Bandwidth" value={`${link.bandwidth.toFixed(2)} Gbps`} />
      <Line label="Latency" value={`${link.latency} ms`} />
      <Line label="Signal quality" value={`${link.signal} %`} />
      <Line label="Packet loss" value={`${link.loss.toFixed(2)} %`} />

      {onRoute ? (
        <PathChain segments={state.route} state={state} activeId={link.segment.id} />
      ) : (
        <div className="mt-3 flex gap-1.5">
          {[link.segment.from, link.segment.to].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => state.select({ type: 'asset', id })}
              className="flex-1 rounded border border-white/[0.09] px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {ASSET_BY_ID[id]?.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60">Weather impact</div>
        <p className="mt-1 text-[11px] leading-snug text-foreground/85">{link.weatherImpact}</p>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{meta.desc}</p>
    </>
  );
}

export function ObjectCard({ state }: { state: OloLinkState }) {
  const sel = state.selection;
  const link = sel?.type === 'link' ? state.links.find((l) => l.segment.id === sel.id) : undefined;
  const title =
    sel?.type === 'asset'
      ? ASSET_BY_ID[sel.id]?.name
      : link
        ? `${ASSET_BY_ID[link.segment.from]?.name} → ${ASSET_BY_ID[link.segment.to]?.name}`
        : undefined;

  return (
    <AnimatePresence>
      {sel && title && (
        <motion.div
          key={`${sel.type}-${sel.id}`}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className="pointer-events-auto absolute right-4 top-[72px] z-30 max-h-[calc(100vh-13rem)] w-[288px] overflow-y-auto rounded-2xl border border-white/25 bg-[#050505] p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.85)]"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] text-sky-400">
                <Crosshair className="h-3 w-3" />
                {sel.type === 'asset' ? 'Asset' : 'Communication link'}
              </div>
              <h3 className="mt-1 text-[13px] font-semibold tracking-wide text-foreground">{title}</h3>
            </div>
            <button
              type="button"
              onClick={() => state.select(null)}
              aria-label="Close details"
              className="rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {sel.type === 'asset' ? (
            <AssetBody state={state} id={sel.id} />
          ) : link ? (
            <LinkBody link={link} state={state} />
          ) : null}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
