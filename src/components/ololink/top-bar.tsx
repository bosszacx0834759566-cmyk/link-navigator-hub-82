'use client';

import { RotateCcw, Satellite } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OloLinkState } from '@/hooks/use-ololink';
import { formatT } from '@/hooks/use-ololink';

type Tone = 'ok' | 'warn' | 'crit' | 'info';

const TONE: Record<Tone, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  crit: 'text-rose-400',
  info: 'text-sky-400',
};

function Stat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: Tone;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 leading-none">
      <span className="text-[8px] uppercase tracking-[0.26em] text-muted-foreground/55">{label}</span>
      <span className="flex items-center gap-1.5">
        {tone && (
          <span className={cn('text-[8px]', TONE[tone])} aria-hidden>
            ●
          </span>
        )}
        <span
          className={cn(
            'text-[11px] font-medium tracking-wide text-foreground',
            mono && 'font-mono tabular-nums'
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

export function TopBar({ state }: { state: OloLinkState }) {
  const { profile, telemetry, missionTime, aiProcessing } = state;
  const activeLinks = state.links.filter((l) => l.status === 'ACTIVE').length;

  const netTone: Tone =
    profile.networkHealth === 'NOMINAL' ? 'ok' : profile.networkHealth === 'STABLE' ? 'warn' : 'crit';
  const wxTone: Tone = profile.severity > 60 ? 'crit' : profile.severity > 30 ? 'warn' : 'ok';

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex h-12 items-center gap-6 border-b border-white/25 bg-[#050505] pl-4 pr-5">
      <div className="flex w-[168px] shrink-0 items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-sky-400/30 bg-sky-500/10">
          <Satellite className="h-3 w-3 text-sky-300" />
        </span>
        <div className="leading-none">
          <div className="text-[12px] font-semibold tracking-[0.32em] text-foreground">OLOLINK</div>
        </div>
        <span className="ml-auto h-4 w-px bg-white/[0.07]" />
      </div>

      <div className="flex flex-1 items-center gap-7 overflow-x-auto [scrollbar-width:none]">
        <Stat label="Mission" value={formatT(missionTime)} tone={state.running ? 'ok' : 'warn'} mono />
        <Stat label="Network" value={profile.networkHealth} tone={netTone} />
        <Stat label="Weather" value={profile.short} tone={wxTone} />
        <Stat
          label="System"
          value={aiProcessing ? 'RECALCULATING' : profile.systemMode}
          tone={aiProcessing ? 'warn' : 'info'}
        />
        <Stat label="Comms" value={`${activeLinks}/${state.links.length} links`} mono />
        <Stat label="Latency" value={`${telemetry.latency} ms`} mono />
        <Stat label="Bandwidth" value={`${telemetry.bandwidth.toFixed(2)} Gbps`} mono />
        <Stat label="Availability" value={`${telemetry.availability.toFixed(2)}%`} mono />
      </div>

      <button
        type="button"
        onClick={state.reset}
        title="Reset all comms & laser links"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border border-rose-400/30 bg-rose-500/10 px-2.5 text-[9px] font-medium uppercase tracking-[0.2em] text-rose-300 transition-colors hover:bg-rose-500/20"
      >
        <RotateCcw className="h-3 w-3" />
        Reset links
      </button>
    </header>
  );
}
