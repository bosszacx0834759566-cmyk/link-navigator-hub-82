'use client';

import { cn } from '@/lib/utils';
import type { RailId, ViewMode } from '@/hooks/use-ololink';
import { RAIL_ITEMS } from './rail';
import { ViewSwitch } from './view-switch';
import logoUrl from '@/assets/logo.png';

function TopNavButton({
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
        'group relative flex h-9 shrink-0 items-center gap-2 rounded-[8px] px-2.5 outline-none transition-all duration-150',
        'focus-visible:ring-1 focus-visible:ring-sky-400/60',
        isActive
          ? 'bg-sky-500/[0.14] text-sky-300'
          : 'text-muted-foreground/70 hover:bg-white/[0.05] hover:text-foreground active:scale-[0.96]'
      )}
    >
      <Icon className="h-[16px] w-[16px]" strokeWidth={1.5} />
      <span className="text-[10px] font-medium uppercase tracking-[0.16em]">{item.label}</span>
      {badge ? (
        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.85)]" />
      ) : null}

      {/* active indicator */}
      <span
        className={cn(
          'absolute inset-x-2 -bottom-[2px] h-[2px] rounded-full bg-sky-400 transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  );
}

export function TopNav({
  active,
  onToggle,
  alertCount,
  view,
  onViewChange,
}: {
  active: RailId | null;
  onToggle: (id: RailId) => void;
  alertCount: number;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  const main = RAIL_ITEMS.filter((i) => i.id !== 'settings');
  const settings = RAIL_ITEMS.find((i) => i.id === 'settings')!;

  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-white/25 bg-[#050505] px-4">
      {/* brand mark */}
      <div className="flex shrink-0 items-center gap-2.5">
        <img src={logoUrl} alt="OloLink logo" className="h-7 w-auto" />
        <span className="text-[11px] font-semibold tracking-[0.28em] text-foreground">OLOLINK</span>
      </div>

      <span className="h-5 w-px shrink-0 bg-white/[0.08]" />

      {/* workspace tabs / tools */}
      <div className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {main.map((item) => (
          <TopNavButton
            key={item.id}
            item={item}
            isActive={active === item.id}
            onToggle={() => onToggle(item.id)}
            badge={item.id === 'alerts' ? alertCount : undefined}
          />
        ))}
      </div>

      {/* spatial view mode switch — same mission state, different projection */}
      <ViewSwitch view={view} onChange={onViewChange} />

      {/* camera view menu — mounted here by GlobeScene via portal */}
      <div id="ololink-view-menu-slot" className="flex shrink-0 items-center" />

      <span className="hidden h-5 w-px shrink-0 bg-white/[0.08] md:block" />

      {/* settings */}
      <div className="hidden shrink-0 md:block">
        <TopNavButton
          item={settings}
          isActive={active === 'settings'}
          onToggle={() => onToggle('settings')}
        />
      </div>
    </nav>
  );
}
