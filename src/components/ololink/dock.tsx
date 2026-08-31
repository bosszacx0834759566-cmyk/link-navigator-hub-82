'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Pause, Layers, SlidersHorizontal, History, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ASSETS, SCENARIO_ORDER, SCENARIOS, TECH_META, type Tech } from '@/lib/ololink';
import type { OloLinkState } from '@/hooks/use-ololink';

type Pop = 'search' | 'layers' | 'filters' | 'history' | null;

const TECHS: Tech[] = ['OPTICAL', 'FSO', 'MICROWAVE', 'RF', 'FIBER'];

function DockButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean | undefined;
  onClick?: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ?? false}
      className={cn(
        'group relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-sky-500/[0.15] text-sky-300'
          : 'text-muted-foreground/65 hover:bg-white/[0.05] hover:text-foreground'
      )}
    >
      {children}
      <span className="pointer-events-none absolute -top-8 z-50 hidden whitespace-nowrap rounded border border-white/[0.08] bg-[#0a0f1c]/95 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-foreground opacity-0 backdrop-blur-xl transition-opacity group-hover:opacity-100 md:block">
        {label}
      </span>
    </button>
  );
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 8, opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="absolute bottom-[52px] left-1/2 w-[320px] -translate-x-1/2 rounded-2xl border border-white/25 bg-[#050505] p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.85)]"
    >
      {children}
    </motion.div>
  );
}

function PopTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[9px] uppercase tracking-[0.28em] text-muted-foreground/60">{children}</div>
  );
}

function Toggle({ on, label, desc, onClick }: { on: boolean; label: string; desc?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <span
        className={cn(
          'relative h-3.5 w-6 shrink-0 rounded-full transition-colors',
          on ? 'bg-sky-500/70' : 'bg-white/[0.12]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all',
            on ? 'left-3' : 'left-0.5'
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-foreground/90">{label}</span>
        {desc && <span className="block truncate text-[9px] text-muted-foreground/60">{desc}</span>}
      </span>
    </button>
  );
}

export function Dock({ state }: { state: OloLinkState }) {
  const { running, setRunning, layers, toggleLayer, scenarioId, setScenario, aiProcessing } = state;
  const [pop, setPop] = useState<Pop>(null);
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ASSETS.slice(0, 6);
    return ASSETS.filter(
      (a) => a.name.toLowerCase().includes(term) || a.region.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [q]);

  const toggle = (p: Exclude<Pop, null>) => setPop((c) => (c === p ? null : p));

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <AnimatePresence mode="wait">
        {pop === 'search' && (
          <Popover key="search">
            <div className="mb-2 flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search assets, regions..."
                className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label="Clear search">
                  <X className="h-3 w-3 text-muted-foreground/70" />
                </button>
              )}
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {results.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    state.select({ type: 'asset', id: a.id });
                    setPop(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      a.health === 'NOMINAL' ? 'bg-emerald-400' : a.health === 'DEGRADED' ? 'bg-amber-400' : 'bg-rose-500'
                    )}
                  />
                  <span className="flex-1 truncate text-[12px] text-foreground/90">{a.name}</span>
                  <span className="font-mono text-[9px] text-muted-foreground/60">{a.region}</span>
                </button>
              ))}
              {results.length === 0 && (
                <p className="px-2 py-3 text-[11px] text-muted-foreground">No matching assets.</p>
              )}
            </div>
          </Popover>
        )}

        {pop === 'layers' && (
          <Popover key="layers">
            <PopTitle>Environment layers</PopTitle>
            <Toggle on={layers.weather} label="Weather" desc="Clouds, rain bands, storm cells" onClick={() => toggleLayer('weather')} />
            <Toggle on={layers.orbits} label="Orbital shells" desc="LEO reference rings" onClick={() => toggleLayer('orbits')} />
            <Toggle on={layers.routes} label="Communication paths" desc="Animated link geometry" onClick={() => toggleLayer('routes')} />
            <Toggle on={layers.labels} label="Labels" desc="Names on route-critical assets" onClick={() => toggleLayer('labels')} />
          </Popover>
        )}

        {pop === 'filters' && (
          <Popover key="filters">
            <PopTitle>Link technology filter</PopTitle>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {TECHS.map((t) => {
                const on = state.techFilter[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => state.toggleTech(t)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[9px] uppercase tracking-[0.16em] transition-colors',
                      on
                        ? 'border-sky-400/35 bg-sky-500/[0.1] text-sky-200'
                        : 'border-white/[0.08] text-muted-foreground/60 hover:text-foreground'
                    )}
                  >
                    {TECH_META[t].short}
                  </button>
                );
              })}
            </div>
            <PopTitle>Weather condition</PopTitle>
            <div className="grid grid-cols-4 gap-1">
              {SCENARIO_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={aiProcessing}
                  onClick={() => setScenario(id)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-[9px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50',
                    scenarioId === id
                      ? 'border-sky-400/35 bg-sky-500/[0.1] text-sky-200'
                      : 'border-white/[0.08] text-muted-foreground/65 hover:text-foreground'
                  )}
                >
                  {SCENARIOS[id].short}
                </button>
              ))}
            </div>
          </Popover>
        )}

        {pop === 'history' && (
          <Popover key="history">
            <PopTitle>Session history</PopTitle>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {state.events.slice(-20).reverse().map((e) => (
                <div key={e.id} className="flex gap-2 font-mono text-[10px] leading-snug">
                  <span className="text-muted-foreground/50">{e.time}</span>
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
          </Popover>
        )}
      </AnimatePresence>

    </div>
  );
}
