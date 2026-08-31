'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  ASSETS,
  ASSET_BY_ID,
  KIND_META,
  SCENARIOS,
  SCENARIO_ORDER,
  TECH_META,
  type AssetKind,
} from '@/lib/ololink';
import { RAIL_ITEMS } from '@/components/ololink/rail';
import { DecisionPanel } from '@/components/ololink/decision-panel';
import type { OloLinkState, RailId } from '@/hooks/use-ololink';

const KIND_ORDER: AssetKind[] = ['satellite', 'haps', 'drone', 'ground', 'customer'];

/* ------------------------------------------------------------ primitives */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[9px] uppercase tracking-[0.28em] text-muted-foreground/60">{title}</div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/[0.04] py-1.5 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[11px] tabular-nums text-foreground', tone)}>{value}</span>
    </div>
  );
}

function ListButton({
  label,
  meta,
  active,
  dot,
  onClick,
}: {
  label: string;
  meta?: string | undefined;
  active?: boolean | undefined;
  dot?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-sky-500/10' : 'hover:bg-white/[0.04]'
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot ?? 'bg-sky-400/70')} />
      <span className={cn('flex-1 truncate text-[12px]', active ? 'text-sky-200' : 'text-foreground/90')}>
        {label}
      </span>
      {meta && <span className="font-mono text-[9px] text-muted-foreground/70">{meta}</span>}
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70" />
    </button>
  );
}

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 rounded-[6px] px-2 py-1.5 text-[9px] uppercase tracking-[0.18em] transition-colors',
            active === t.id
              ? 'bg-sky-500/[0.14] text-sky-300'
              : 'text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- contents */

function AssetsPanel({ state }: { state: OloLinkState }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return KIND_ORDER.map((kind) => ({
      kind,
      items: ASSETS.filter(
        (a) => a.kind === kind && (!term || a.name.toLowerCase().includes(term) || a.region.toLowerCase().includes(term))
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets..."
          className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
      </div>
      {groups.map((g) => (
        <Section key={g.kind} title={KIND_META[g.kind].plural}>
          <div className="space-y-0.5">
            {g.items.map((a) => (
              <ListButton
                key={a.id}
                label={a.name}
                meta={a.altKm > 0 ? `${a.altKm} km` : a.region}
                active={state.selection?.type === 'asset' && state.selection.id === a.id}
                dot={
                  a.health === 'NOMINAL'
                    ? 'bg-emerald-400'
                    : a.health === 'DEGRADED'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                }
                onClick={() => state.select({ type: 'asset', id: a.id })}
              />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function OverviewPanel({ state }: { state: OloLinkState }) {
  const { profile, telemetry } = state;
  return (
    <div>
      <Section title="Situation">
        <p className="text-[12px] leading-relaxed text-foreground/85">{profile.summary}</p>
      </Section>
      <Section title="Active route">
        <div className="space-y-1">
          {profile.route.map((id, i) => (
            <div key={id} className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-muted-foreground/60">{String(i + 1).padStart(2, '0')}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              <button
                type="button"
                onClick={() => state.select({ type: 'asset', id })}
                className="text-[12px] text-foreground/90 hover:text-sky-300"
              >
                {ASSET_BY_ID[id]?.name}
              </button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Live orchestration">
        <Row label="Bandwidth" value={`${telemetry.bandwidth.toFixed(2)} Gbps`} />
        <Row label="Latency" value={`${telemetry.latency} ms`} />
        <Row label="Packet loss" value={`${telemetry.packetLoss.toFixed(2)} %`} />
        <Row label="Signal" value={`${telemetry.signal} %`} />
        <Row label="Availability" value={`${telemetry.availability.toFixed(2)} %`} />
      </Section>
      <Section title="Recent events">
        <div className="space-y-1">
          {state.events.slice(-8).reverse().map((e) => (
            <div key={e.id} className="flex gap-2">
              <span className="font-mono text-[9px] text-muted-foreground/60">{e.time}</span>
              <span
                className={cn(
                  'text-[11px] leading-snug',
                  e.level === 'ALERT'
                    ? 'text-rose-300'
                    : e.level === 'WARN'
                      ? 'text-amber-300'
                      : e.level === 'OK'
                        ? 'text-emerald-300'
                        : 'text-foreground/80'
                )}
              >
                {e.text}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function TopologyPanel({ state }: { state: OloLinkState }) {
  const active = state.links.filter((l) => l.status === 'ACTIVE');
  const blocked = state.links.filter((l) => l.status === 'UNAVAILABLE');
  const degraded = state.links.filter((l) => l.status === 'DEGRADED');
  return (
    <div>
      <Section title="Topology health">
        <Row label="Segments total" value={String(state.links.length)} />
        <Row label="Active" value={String(active.length)} tone="text-emerald-300" />
        <Row label="Degraded" value={String(degraded.length)} tone="text-amber-300" />
        <Row label="Standby" value={String(state.links.length - active.length - blocked.length - degraded.length)} tone="text-sky-300" />
        <Row label="Unavailable" value={String(blocked.length)} tone="text-rose-300" />
      </Section>
      <Section title="Layer utilisation">
        <div className="space-y-3">
          {(['OPTICAL', 'FSO', 'MICROWAVE', 'RF'] as const).map((tech) => {
            const list = state.links.filter((l) => l.segment.tech === tech);
            const avg = list.reduce((s, l) => s + l.signal, 0) / (list.length || 1);
            const off = state.profile.blockedTech.includes(tech);
            return (
              <div key={tech}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-foreground/85">{TECH_META[tech].label}</span>
                  <span className={cn('font-mono text-[10px]', off ? 'text-rose-400' : 'text-muted-foreground')}>
                    {off ? 'UNAVAILABLE' : `${Math.round(avg)}%`}
                  </span>
                </div>
                <Bar value={off ? 0 : avg} tone={off ? 'bg-rose-500' : TECH_META[tech].family === 'optical' ? 'bg-sky-400' : 'bg-amber-400'} />
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Assets by class">
        {KIND_ORDER.map((k) => (
          <Row key={k} label={KIND_META[k].plural} value={String(ASSETS.filter((a) => a.kind === k).length)} />
        ))}
      </Section>
    </div>
  );
}

function LinksPanel({ state }: { state: OloLinkState }) {
  return (
    <div className="space-y-1">
      {state.links.filter((l) => state.techFilter[l.segment.tech]).map((l) => {
        const meta = TECH_META[l.segment.tech];
        return (
          <button
            key={l.segment.id}
            type="button"
            onClick={() => state.select({ type: 'link', id: l.segment.id })}
            className={cn(
              'w-full rounded-md border px-2.5 py-2 text-left transition-colors',
              state.selection?.type === 'link' && state.selection.id === l.segment.id
                ? 'border-sky-400/40 bg-sky-500/10'
                : 'border-white/[0.06] hover:bg-white/[0.03]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-foreground/90">
                {ASSET_BY_ID[l.segment.from]?.name} → {ASSET_BY_ID[l.segment.to]?.name}
              </span>
              <span
                className={cn(
                  'font-mono text-[9px] uppercase tracking-[0.14em]',
                  l.status === 'ACTIVE'
                    ? 'text-emerald-400'
                    : l.status === 'UNAVAILABLE'
                      ? 'text-rose-400'
                      : l.status === 'DEGRADED'
                        ? 'text-amber-400'
                        : l.status === 'REROUTING'
                          ? 'text-sky-300'
                          : 'text-muted-foreground'
                )}
              >
                {l.status}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
              <span style={{ color: meta.color }}>{meta.label}</span>
              <span>·</span>
              <span>{l.bandwidth.toFixed(2)} Gbps</span>
              <span>·</span>
              <span>{l.latency} ms</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WeatherBody({ state }: { state: OloLinkState }) {
  const { profile } = state;
  return (
    <div>
      <Section title="Atmospheric state">
        <Row label="Severity index" value={`${profile.severity}`} tone={profile.severity > 60 ? 'text-rose-300' : profile.severity > 30 ? 'text-amber-300' : 'text-emerald-300'} />
        <Row label="Cloud coverage" value={`${Math.min(98, Math.round(profile.severity * 1.05))} %`} />
        <Row label="Rain intensity" value={profile.severity > 60 ? 'HEAVY' : profile.severity > 35 ? 'LIGHT' : 'NONE'} />
        <Row label="Visibility" value={`${Math.max(1, Math.round(28 - profile.severity * 0.26))} km`} />
        <Row
          label="Optical availability"
          value={profile.blockedTech.length ? 'UNAVAILABLE' : 'AVAILABLE'}
          tone={profile.blockedTech.length ? 'text-rose-300' : 'text-emerald-300'}
        />
      </Section>
      <Section title="Weather cells">
        {profile.weather.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No significant cells tracked.</p>
        ) : (
          <div className="space-y-2">
            {profile.weather.map((c) => (
              <div key={c.id} className="rounded-md border border-white/[0.06] px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-foreground/90">{c.name}</span>
                  <span
                    className={cn(
                      'font-mono text-[9px]',
                      c.kind === 'STORM' ? 'text-rose-400' : c.kind === 'RAIN' ? 'text-sky-400' : 'text-slate-300'
                    )}
                  >
                    {c.kind}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={c.severity} tone={c.kind === 'STORM' ? 'bg-rose-500' : c.kind === 'RAIN' ? 'bg-sky-400' : 'bg-slate-400'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Simulate conditions">
        <div className="grid grid-cols-2 gap-1.5">
          {SCENARIO_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => state.setScenario(id)}
              className={cn(
                'rounded-md border px-2 py-1.5 text-[10px] uppercase tracking-[0.16em] transition-colors',
                state.scenarioId === id
                  ? 'border-sky-400/40 bg-sky-500/10 text-sky-300'
                  : 'border-white/[0.07] text-muted-foreground hover:text-foreground'
              )}
            >
              {SCENARIOS[id].short}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function AiBody({ state }: { state: OloLinkState }) {
  const { profile, aiProcessing } = state;
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 rounded-full', aiProcessing ? 'animate-pulse bg-amber-400' : 'bg-emerald-400')} />
        <span className={cn('text-[9px] uppercase tracking-[0.24em]', aiProcessing ? 'text-amber-400' : 'text-emerald-400')}>
          {aiProcessing ? 'Evaluating conditions' : 'Decision locked'}
        </span>
      </div>

      <Section title="System analysis">
        <div className="space-y-1.5">
          {profile.ai.analysis.map((a) => (
            <div key={a} className="flex gap-2">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-amber-400/80" />
              <span className="text-[12px] leading-snug text-foreground/85">{a}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recommended action">
        <div className="rounded-md border border-sky-400/20 bg-sky-500/[0.06] p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-sky-300">Reroute traffic through</div>
          <div className="mt-2 space-y-1">
            {profile.ai.recommendation.map((r, i) => (
              <div key={r} className="flex items-center gap-2">
                {i > 0 && <span className="font-mono text-[10px] text-sky-400/60">↓</span>}
                <span className={cn('text-[12px] text-foreground', i === 0 && 'ml-[18px]')}>{r}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Confidence</span>
            <span className="font-mono text-[12px] text-sky-300">{profile.ai.confidence}%</span>
          </div>
          <div className="mt-1.5">
            <Bar value={profile.ai.confidence} tone="bg-sky-400" />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={state.approve}
              className="flex-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-sky-200 transition-colors hover:bg-sky-500/25"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={state.approve}
              className="flex-1 rounded-md border border-white/[0.09] px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Auto execute
            </button>
          </div>
        </div>
      </Section>

      <Section title="Decision log">
        <div className="space-y-1">
          {state.events.slice(-6).reverse().map((e) => (
            <div key={e.id} className="flex gap-2 font-mono text-[10px]">
              <span className="text-muted-foreground/60">{e.time}</span>
              <span className="text-foreground/75">{e.text}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function TimelineBody({ state }: { state: OloLinkState }) {
  const steps = [
    'Session initialised',
    'Weather ingestion',
    'Link prediction',
    'Route selection',
    'Relay activation',
    'Ground reception',
    'Customer handoff',
  ];
  const done = state.profile.severity > 60 ? 6 : state.profile.severity > 30 ? 5 : 4;
  return (
    <div>
      <Section title="Orchestration timeline">
        <div className="space-y-0">
          {steps.map((s, i) => (
            <div key={s} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 rounded-full',
                    i < done ? 'bg-emerald-400' : i === done ? 'animate-pulse bg-sky-400' : 'bg-white/15'
                  )}
                />
                {i < steps.length - 1 && <span className="h-6 w-px bg-white/10" />}
              </div>
              <div className="pb-1">
                <div className={cn('text-[12px]', i <= done ? 'text-foreground/90' : 'text-muted-foreground/60')}>{s}</div>
                <div className="font-mono text-[9px] text-muted-foreground/50">
                  {i <= done ? `T+00:${String(i * 4).padStart(2, '0')}` : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Contingency routes">
        {state.links
          .filter((l) => l.status === 'STANDBY')
          .slice(0, 5)
          .map((l) => (
            <Row
              key={l.segment.id}
              label={`${ASSET_BY_ID[l.segment.from]?.name} → ${ASSET_BY_ID[l.segment.to]?.name}`}
              value={TECH_META[l.segment.tech].label}
            />
          ))}
      </Section>
    </div>
  );
}

function PerformanceBody({ state }: { state: OloLinkState }) {
  return (
    <div>
      <Section title="Rolling performance">
        <Row label="Peak bandwidth" value="10.00 Gbps" />
        <Row label="Current bandwidth" value={`${state.telemetry.bandwidth.toFixed(2)} Gbps`} />
        <Row label="Mean latency" value={`${state.telemetry.latency} ms`} />
        <Row label="Loss (5 min)" value={`${state.telemetry.packetLoss.toFixed(2)} %`} />
        <Row label="Availability (24 h)" value={`${state.telemetry.availability.toFixed(2)} %`} />
      </Section>
      <Section title="Signal trend">
        <div className="flex h-20 items-end gap-[3px]">
          {Array.from({ length: 34 }, (_, i) => {
            const h = Math.max(
              8,
              Math.min(100, state.telemetry.signal + Math.sin(i * 0.7) * 9 + (i % 5) * 2)
            );
            return (
              <span
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-sky-500/15 to-sky-400/80"
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
      </Section>
      <Section title="Traffic by layer">
        {(['OPTICAL', 'FSO', 'MICROWAVE', 'RF'] as const).map((t) => {
          const off = state.profile.blockedTech.includes(t);
          const share = off ? 0 : t === 'RF' || t === 'MICROWAVE' ? 34 : 62;
          return (
            <div key={t} className="mb-2">
              <div className="mb-1 flex justify-between text-[10px]">
                <span className="text-foreground/80">{TECH_META[t].label}</span>
                <span className="font-mono text-muted-foreground">{share}%</span>
              </div>
              <Bar value={share} tone={TECH_META[t].family === 'optical' ? 'bg-sky-400' : 'bg-amber-400'} />
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function AlertsPanel({ state }: { state: OloLinkState }) {
  const alerts = state.profile.alerts;
  return (
    <div>
      <Section title="Active alerts">
        {alerts.length === 0 ? (
          <p className="text-[11px] text-emerald-300">No active alerts. Network nominal.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={cn(
                  'rounded-md border px-2.5 py-2',
                  a.level === 'CRITICAL'
                    ? 'border-rose-500/30 bg-rose-500/[0.07]'
                    : a.level === 'WARN'
                      ? 'border-amber-500/30 bg-amber-500/[0.06]'
                      : 'border-white/[0.07]'
                )}
              >
                <div
                  className={cn(
                    'text-[9px] uppercase tracking-[0.2em]',
                    a.level === 'CRITICAL' ? 'text-rose-400' : a.level === 'WARN' ? 'text-amber-400' : 'text-sky-400'
                  )}
                >
                  {a.level}
                </div>
                <div className="mt-1 text-[12px] text-foreground/90">{a.text}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Event stream">
        <div className="space-y-1">
          {state.events.slice(-14).reverse().map((e) => (
            <div key={e.id} className="flex gap-2 font-mono text-[10px]">
              <span className="text-muted-foreground/60">{e.time}</span>
              <span
                className={cn(
                  e.level === 'ALERT'
                    ? 'text-rose-300'
                    : e.level === 'WARN'
                      ? 'text-amber-300'
                      : e.level === 'OK'
                        ? 'text-emerald-300'
                        : 'text-foreground/75'
                )}
              >
                {e.text}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function SettingsPanel({ state }: { state: OloLinkState }) {
  const items: { key: keyof OloLinkState['layers']; label: string; desc: string }[] = [
    { key: 'weather', label: 'Weather layer', desc: 'Cloud decks, rain bands and storm cells' },
    { key: 'orbits', label: 'Orbital shells', desc: 'LEO shell reference rings' },
    { key: 'routes', label: 'Communication paths', desc: 'Animated link geometry' },
    { key: 'labels', label: 'Contextual labels', desc: 'Names on route-critical assets' },
  ];
  return (
    <div>
      <Section title="Environment layers">
        <div className="space-y-1">
          {items.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => state.toggleLayer(i.key)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span
                className={cn(
                  'relative h-3.5 w-6 shrink-0 rounded-full transition-colors',
                  state.layers[i.key] ? 'bg-sky-500/70' : 'bg-white/12'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all',
                    state.layers[i.key] ? 'left-3' : 'left-0.5'
                  )}
                />
              </span>
              <span className="flex-1">
                <span className="block text-[12px] text-foreground/90">{i.label}</span>
                <span className="block text-[10px] text-muted-foreground/70">{i.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Session">
        <Row label="Simulation" value={state.running ? 'RUNNING' : 'PAUSED'} />
        <Row label="Weather state" value={state.profile.name} />
        <Row label="Interface" value="OloLink Explorer v2" />
      </Section>
    </div>
  );
}


function NetworkPanel({ state }: { state: OloLinkState }) {
  const [tab, setTab] = useState('topology');
  return (
    <div>
      <Tabs
        tabs={[
          { id: 'topology', label: 'Topology' },
          { id: 'links', label: 'Links' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'topology' ? <TopologyPanel state={state} /> : <LinksPanel state={state} />}
    </div>
  );
}

function IntelPanel({ state }: { state: OloLinkState }) {
  const [tab, setTab] = useState('ai');
  return (
    <div>
      <Tabs
        tabs={[
          { id: 'ai', label: 'AI Decisions' },
          { id: 'weather', label: 'Weather' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'ai' ? <AiBody state={state} /> : <WeatherBody state={state} />}
    </div>
  );
}

function AnalyticsPanel({ state }: { state: OloLinkState }) {
  const [tab, setTab] = useState('performance');
  return (
    <div>
      <Tabs
        tabs={[
          { id: 'performance', label: 'Performance' },
          { id: 'timeline', label: 'Timeline' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'performance' ? <PerformanceBody state={state} /> : <TimelineBody state={state} />}
    </div>
  );
}

/* ---------------------------------------------------------------- shell */


const PANELS: Partial<Record<RailId, (p: { state: OloLinkState }) => React.ReactElement>> = {
  overview: OverviewPanel,
  assets: AssetsPanel,
  network: NetworkPanel,
  intel: IntelPanel,
  analytics: AnalyticsPanel,
  alerts: AlertsPanel,
  settings: SettingsPanel,
  context: DecisionPanel,
};

export function ContextPanel({ state }: { state: OloLinkState }) {
  const id = state.panel;
  const selectedAsset =
    state.selection?.type === 'asset'
      ? ASSET_BY_ID[state.selection.id]
      : state.selection
        ? ASSET_BY_ID[
            state.links.find((l) => l.segment.id === state.selection!.id)?.segment.from ?? ''
          ]
        : undefined;
  const item =
    id === 'context'
      ? {
          id: 'context' as RailId,
          label: selectedAsset ? selectedAsset.name : 'Context',
          hint: selectedAsset
            ? `${KIND_META[selectedAsset.kind].label} · ${selectedAsset.region} · decisions & routing`
            : 'Selection context',
        }
      : RAIL_ITEMS.find((r) => r.id === id);
  const Body = id ? PANELS[id] : null;

  return (
    <AnimatePresence>
      {id && Body && item && (
        <motion.aside
          key={id}
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className="pointer-events-auto absolute bottom-3 left-3 top-16 z-20 flex w-[336px] flex-col overflow-hidden rounded-2xl border border-white/25 bg-[#050505] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.85)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-foreground">
                {item.label}
              </h2>
              <p className="mt-1 text-[10px] tracking-wide text-muted-foreground/60">{item.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
              if (id === 'context') state.select(null);
              state.setPanel(null);
            }}
              aria-label="Close panel"
              className="rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <Body state={state} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
