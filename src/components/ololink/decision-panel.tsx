'use client';

import { cn } from '@/lib/utils';
import {
  ASSET_BY_ID,
  KIND_META,
  STATUS_META,
  TECH_META,
  assetContext,
  type LinkState,
} from '@/lib/ololink';
import type { OloLinkState } from '@/hooks/use-ololink';

function Head({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center gap-2 first:mt-0">
      <span className="text-[9px] uppercase tracking-[0.28em] text-muted-foreground/60">{children}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/[0.04] py-1 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">{label}</span>
      <span className={cn('font-mono text-[11px] tabular-nums text-foreground', tone)}>{value}</span>
    </div>
  );
}

function StatusTag({ status }: { status: LinkState['status'] }) {
  const m = STATUS_META[status];
  return (
    <span
      className="rounded-sm border px-1 py-px font-mono text-[8px] uppercase tracking-[0.16em]"
      style={{ color: m.color, borderColor: `${m.color}40`, backgroundColor: `${m.color}12` }}
    >
      {m.label}
    </span>
  );
}

function LinkRow({ l, state }: { l: LinkState; state: OloLinkState }) {
  const meta = TECH_META[l.segment.tech];
  const selected = state.selection?.type === 'link' && state.selection.id === l.segment.id;
  return (
    <button
      type="button"
      onClick={() => state.select({ type: 'link', id: l.segment.id })}
      className={cn(
        'w-full rounded-md border px-2 py-1.5 text-left transition-colors',
        selected ? 'border-sky-400/40 bg-sky-500/10' : 'border-white/[0.05] hover:bg-white/[0.04]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-foreground/90">
          {ASSET_BY_ID[l.segment.from]?.name} → {ASSET_BY_ID[l.segment.to]?.name}
        </span>
        <StatusTag status={l.status} />
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground/80">
        <span style={{ color: meta.color }}>{meta.short}</span>
        <span>·</span>
        <span>{l.bandwidth.toFixed(2)} Gbps</span>
        <span>·</span>
        <span>{l.latency} ms</span>
        <span>·</span>
        <span className={l.impact >= 20 ? 'text-amber-300' : ''}>wx {l.impact}%</span>
      </div>
    </button>
  );
}

/** Context-aware decision surface for the current selection. */
export function DecisionPanel({ state }: { state: OloLinkState }) {
  const sel = state.selection;
  if (!sel) return <div className="text-[11px] text-muted-foreground">No selection.</div>;

  const assetId =
    sel.type === 'asset'
      ? sel.id
      : state.links.find((l) => l.segment.id === sel.id)?.segment.from ?? null;
  const ctx = assetId ? assetContext(assetId, state.profile, state.links) : null;
  const selectedLink =
    sel.type === 'link' ? state.links.find((l) => l.segment.id === sel.id) ?? null : null;
  if (!ctx) return <div className="text-[11px] text-muted-foreground">No context.</div>;

  const { asset, profile } = { asset: ctx.asset, profile: state.profile };
  const decisionLog = state.events.slice(-40).reverse().slice(0, 14);

  return (
    <div>
      <Head>Mission context</Head>
      <KV label="Node" value={asset.name} />
      <KV label="Class" value={KIND_META[asset.kind].label} />
      <KV
        label="Path role"
        value={ctx.onRoute ? 'ON PRIMARY PATH' : 'RESERVE'}
        tone={ctx.onRoute ? 'text-emerald-300' : 'text-slate-300'}
      />
      <KV label="System mode" value={profile.systemMode} />
      {selectedLink && (
        <KV
          label="Selected link"
          value={`${TECH_META[selectedLink.segment.tech].short} · ${STATUS_META[selectedLink.status].label}`}
          tone={STATUS_META[selectedLink.status].tone}
        />
      )}

      <Head>Weather analysis</Head>
      <KV label="Scenario" value={profile.name} />
      <KV
        label="Local exposure"
        value={`${ctx.exposure}%`}
        tone={ctx.exposure >= 55 ? 'text-rose-300' : ctx.exposure >= 20 ? 'text-amber-300' : 'text-emerald-300'}
      />
      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            ctx.exposure >= 55 ? 'bg-rose-500' : ctx.exposure >= 20 ? 'bg-amber-400' : 'bg-emerald-400'
          )}
          style={{ width: `${Math.max(2, Math.min(100, ctx.exposure))}%` }}
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {ctx.cells.length
          ? `Intersecting cells: ${ctx.cells.join(', ')}.`
          : 'No weather cell intersects this node’s active geometry.'}
      </p>

      <Head>AI decisions</Head>
      <div className="space-y-1.5">
        {ctx.decisions.map((d) => (
          <div key={d.title} className="rounded-md border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] leading-snug text-foreground/90">{d.title}</span>
              <span
                className={cn(
                  'shrink-0 font-mono text-[8px] uppercase tracking-[0.18em]',
                  d.state === 'APPLIED'
                    ? 'text-emerald-300'
                    : d.state === 'PENDING'
                      ? 'text-sky-300'
                      : 'text-muted-foreground/70'
                )}
              >
                {d.state}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{d.detail}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-sky-400/80" style={{ width: `${d.confidence}%` }} />
              </div>
              <span className="font-mono text-[8px] text-muted-foreground/70">{d.confidence}%</span>
            </div>
          </div>
        ))}
      </div>

      <Head>Route recommendations</Head>
      <ul className="space-y-1">
        {ctx.recommendations.map((r) => (
          <li key={r} className="flex gap-2 text-[10px] leading-relaxed text-foreground/80">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-sky-400" />
            {r}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={state.approve}
        className="mt-2.5 w-full rounded-md border border-sky-400/30 bg-sky-500/[0.12] py-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-sky-200 transition-colors hover:bg-sky-500/20"
      >
        Approve · {profile.ai.action}
      </button>

      <Head>Attached links</Head>
      <div className="space-y-1">
        {ctx.links.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No transports terminate on this node.</p>
        )}
        {ctx.links.map((l) => (
          <LinkRow key={l.segment.id} l={l} state={state} />
        ))}
      </div>

      <Head>Alerts</Head>
      {ctx.alerts.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No active alerts for this node.</p>
      ) : (
        <div className="space-y-1">
          {ctx.alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                'rounded-md border px-2 py-1.5 text-[10px] leading-snug',
                a.level === 'CRITICAL'
                  ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-200'
                  : a.level === 'WARN'
                    ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200'
                    : 'border-white/[0.07] text-foreground/80'
              )}
            >
              {a.text}
            </div>
          ))}
        </div>
      )}

      <Head>Decision log</Head>
      <div className="space-y-0.5">
        {decisionLog.map((e) => (
          <div key={e.id} className="flex gap-2 font-mono text-[9px] leading-relaxed">
            <span className="shrink-0 text-muted-foreground/50">{e.time}</span>
            <span
              className={cn(
                'min-w-0 flex-1',
                e.level === 'ALERT'
                  ? 'text-rose-300'
                  : e.level === 'WARN'
                    ? 'text-amber-300'
                    : e.level === 'OK'
                      ? 'text-emerald-300'
                      : 'text-foreground/70'
              )}
            >
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
