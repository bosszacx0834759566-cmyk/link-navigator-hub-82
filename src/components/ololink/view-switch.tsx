'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/hooks/use-ololink';

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: '3d', label: '3D', hint: 'Spatial / orbital visualisation' },
  { id: '2d', label: '2D', hint: 'Operational map & network routing' },
];

/** Compact segmented control switching the spatial environment between views. */
export function ViewSwitch({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div
      role="group"
      aria-label="Spatial view mode"
      className="flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-[#070b14]/85 p-0.5 backdrop-blur-md"
    >
      {MODES.map((m) => {
        const active = view === m.id;
        return (
          <button
            key={m.id}
            type="button"
            title={m.hint}
            aria-pressed={active}
            onClick={() => onChange(m.id)}
            className={cn(
              'relative h-6 w-[42px] rounded-full font-mono text-[10px] uppercase tracking-[0.18em] transition-colors',
              active ? 'text-sky-200' : 'text-muted-foreground/60 hover:text-foreground/80'
            )}
          >
            {active && (
              <motion.span
                layoutId="view-switch-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-sky-500/[0.16] ring-1 ring-sky-400/25"
              />
            )}
            <span className="relative">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
