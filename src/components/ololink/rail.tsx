'use client';

import {
  Globe2,
  Satellite,
  Network,
  BrainCircuit,
  BarChart3,
  TriangleAlert,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RailId } from '@/hooks/use-ololink';

export const RAIL_ITEMS: { id: RailId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Mission Overview', hint: 'Situation, active route, events', icon: Globe2 },
  { id: 'assets', label: 'Assets', hint: 'Constellation and ground segment', icon: Satellite },
  { id: 'network', label: 'Network & Links', hint: 'Topology health and link inventory', icon: Network },
  { id: 'intel', label: 'AI & Weather', hint: 'Decisions and atmospheric state', icon: BrainCircuit },
  { id: 'analytics', label: 'Analytics', hint: 'Performance and orchestration timeline', icon: BarChart3 },
  { id: 'alerts', label: 'Alerts', hint: 'Active alerts and event stream', icon: TriangleAlert },
  { id: 'settings', label: 'Settings', hint: 'Layers and session', icon: Settings2 },
];

function RailButton({
  item,
  isActive,
  onToggle,
  badge,
}: {
  item: (typeof RAIL_ITEMS)[number];
  isActive: boolean;
  onToggle: () => void;
  badge?: number | undefined;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={item.label}
      aria-pressed={isActive}
      className={cn(
        'group relative flex h-11 w-11 items-center justify-center rounded-[10px] outline-none transition-all duration-150',
        'focus-visible:ring-1 focus-visible:ring-sky-400/60',
        isActive
          ? 'bg-sky-500/[0.14] text-sky-300'
          : 'text-muted-foreground/60 hover:bg-white/[0.05] hover:text-foreground active:scale-[0.96]'
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />

      <span
        className={cn(
          'absolute left-0 top-1/2 w-[2px] -translate-y-1/2 rounded-r bg-sky-400 transition-all duration-200',
          isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'
        )}
      />

      {badge ? (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.85)]" />
      ) : null}

      {/* hover-only label */}
      <span className="pointer-events-none absolute left-[52px] z-50 hidden -translate-x-1 whitespace-nowrap rounded-md border border-white/[0.08] bg-[#0a0f1c]/95 px-2.5 py-1.5 opacity-0 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 md:block">
        <span className="block text-[10px] uppercase tracking-[0.2em] text-foreground">{item.label}</span>
        <span className="mt-0.5 block text-[9px] tracking-wide text-muted-foreground/70">{item.hint}</span>
      </span>
    </button>
  );
}

export function Rail({
  active,
  onToggle,
  alertCount,
}: {
  active: RailId | null;
  onToggle: (id: RailId) => void;
  alertCount: number;
}) {
  const main = RAIL_ITEMS.filter((i) => i.id !== 'settings');
  const settings = RAIL_ITEMS.find((i) => i.id === 'settings')!;

  return (
    <nav className="pointer-events-auto absolute bottom-0 left-0 top-[84px] z-30 flex w-[60px] flex-col items-center border-r border-white/25 bg-[#050505] py-3">
      <div className="flex flex-col items-center gap-1.5">
        {main.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            isActive={active === item.id}
            onToggle={() => onToggle(item.id)}
            badge={item.id === 'alerts' ? alertCount : undefined}
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <span className="mb-1 h-px w-6 bg-white/[0.08]" />
        <RailButton
          item={settings}
          isActive={active === 'settings'}
          onToggle={() => onToggle('settings')}
        />
      </div>
    </nav>
  );
}
