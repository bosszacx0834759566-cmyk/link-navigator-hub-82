'use client';

import { cn } from '@/lib/utils';

export type WorkspaceId = 'dashboard' | 'command' | 'intelligence' | 'analytics';

export const WORKSPACE_TABS: { id: WorkspaceId; label: string; hint: string }[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Mission-wide status at a glance' },
  { id: 'command', label: 'Command', hint: 'Live orchestration and route authority' },
  { id: 'intelligence', label: 'Intelligence', hint: 'Environmental and decision intelligence' },
  { id: 'analytics', label: 'Analytics', hint: 'Performance trends and service quality' },
];

export function WorkspaceTabs({
  workspace,
  onSelect,
}: {
  workspace: WorkspaceId;
  onSelect: (id: WorkspaceId) => void;
}) {
  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-12 z-40 flex h-9 items-center gap-1 border-b border-white/25 bg-[#050505] pl-3 pr-3">
      <span className="mr-2 font-mono text-[8px] uppercase tracking-[0.26em] text-muted-foreground/45">
        Workspace
      </span>
      {WORKSPACE_TABS.map((t) => {
        const isActive = workspace === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={t.hint}
            aria-pressed={isActive}
            onClick={() => onSelect(t.id)}
            className={cn(
              'relative rounded-[6px] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.22em] transition-colors',
              isActive
                ? 'bg-sky-500/[0.14] text-sky-200'
                : 'text-muted-foreground/60 hover:bg-white/[0.05] hover:text-foreground'
            )}
          >
            {t.label}
            <span
              className={cn(
                'absolute inset-x-2 -bottom-[5px] h-[2px] rounded-full bg-sky-400 transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0'
              )}
            />
          </button>
        );
      })}
    </nav>
  );
}
