'use client';

import { KIND_META, TECH_META, type AssetKind, type Tech } from '@/lib/ololink';

const KIND_COLOR: Record<AssetKind, string> = {
  satellite: '#7dd3fc',
  haps: '#38bdf8',
  drone: '#a5b4fc',
  ground: '#34d399',
  customer: '#e2e8f0',
};

const KIND_ORDER: AssetKind[] = ['satellite', 'haps', 'drone', 'ground', 'customer'];
const TECH_ORDER: Tech[] = ['OPTICAL', 'FSO', 'MICROWAVE', 'RF', 'FIBER'];

/** Tiny SVG glyphs echoing the 3D model silhouettes. */
function Glyph({ kind, color }: { kind: AssetKind; color: string }) {
  return (
    <svg viewBox="-8 -8 16 16" className="h-3.5 w-3.5 shrink-0">
      {kind === 'satellite' && (
        <g>
          <g stroke={color} strokeWidth={0.5} strokeOpacity={0.85}>
            <rect x={-6.4} y={-1.7} width={4.2} height={3.4} fill={color} fillOpacity={0.28} />
            <path d="M -5.4 -1.7 V 1.7 M -4.3 -1.7 V 1.7 M -3.2 -1.7 V 1.7" strokeOpacity={0.5} />
            <rect x={2.2} y={-1.7} width={4.2} height={3.4} fill={color} fillOpacity={0.28} />
            <path d="M 3.2 -1.7 V 1.7 M 4.3 -1.7 V 1.7 M 5.4 -1.7 V 1.7" strokeOpacity={0.5} />
            <path d="M -2.2 0 H -1.4 M 2.2 0 H 1.4" />
          </g>
          <rect x={-1.4} y={-1.9} width={2.8} height={3.8} rx={0.3} fill={color} />
          <path d="M -1.1 1.9 A 1.6 1.6 0 0 0 1.1 1.9 Z" fill={color} fillOpacity={0.75} />
          <path d="M 0 -1.9 V -3.4" stroke={color} strokeWidth={0.5} />
        </g>
      )}
      {kind === 'haps' && (
        <g>
          <g stroke={color} strokeWidth={0.5} fill="none" strokeOpacity={0.8}>
            <path d="M -3.6 -0.9 h 0.9 M -1.4 -0.9 h 0.9 M 0.5 -0.9 h 0.9 M 2.7 -0.9 h 0.9" />
          </g>
          <rect x={-7} y={-0.55} width={14} height={1.05} rx={0.5} fill={color} fillOpacity={0.85} />
          <rect x={-0.55} y={-0.4} width={1.1} height={4.4} rx={0.4} fill={color} />
          <rect x={-2} y={3.4} width={4} height={0.8} rx={0.35} fill={color} fillOpacity={0.8} />
        </g>
      )}
      {kind === 'drone' && (
        <g>
          <path
            d="M 0 -4.2 L 0.75 0.2 L 5 2.4 L 5 3.3 L 0.75 2.3 L 0.5 4.2 L -0.5 4.2 L -0.75 2.3 L -5 3.3 L -5 2.4 L -0.75 0.2 Z"
            fill={color}
            fillOpacity={0.9}
          />
          <path d="M -5 2.4 v 1.6 M 5 2.4 v 1.6" stroke={color} strokeWidth={0.6} />
          <path d="M -0.5 4.2 L -2.1 5.4 M 0.5 4.2 L 2.1 5.4" stroke={color} strokeWidth={0.6} />
        </g>
      )}
      {kind === 'ground' && (
        <g>
          <path d="M -4.4 -3.4 A 4.4 4.4 0 0 1 1.6 -0.6 L -3 1 Z" fill={color} fillOpacity={0.55} stroke={color} strokeWidth={0.5} />
          <path d="M -1.6 -1.3 L 0.9 -3.2" stroke={color} strokeWidth={0.5} />
          <circle cx={0.9} cy={-3.2} r={0.5} fill={color} />
          <path d="M -2.4 0.6 L -1.2 3.4" stroke={color} strokeWidth={0.8} />
          <rect x={-4.4} y={3.4} width={8.8} height={0.9} rx={0.35} fill={color} fillOpacity={0.8} />
          <rect x={1.4} y={1.6} width={2.6} height={1.8} fill={color} fillOpacity={0.45} stroke={color} strokeWidth={0.4} />
        </g>
      )}
      {kind === 'customer' && (
        <g>
          <rect x={-2.6} y={-2.6} width={5.2} height={5.2} fill="none" stroke={color} strokeWidth={0.8} />
          <circle r={1.1} fill={color} />
          <path d="M 0 -2.6 V -4 M 0 2.6 V 4 M -2.6 0 H -4 M 2.6 0 H 4" stroke={color} strokeWidth={0.6} strokeOpacity={0.7} />
        </g>
      )}
    </svg>
  );
}


function TechGlyph({ tech }: { tech: Tech }) {
  const { color, family } = TECH_META[tech];
  return (
    <svg viewBox="0 0 26 8" className="h-2 w-6 shrink-0">
      {family === 'optical' && (
        <g stroke={color} strokeWidth={1.6}>
          <path d="M0 4 h26" />
          <circle cx="17" cy="4" r="1.6" fill="#f0f9ff" stroke="none" />
        </g>
      )}
      {family === 'radio' && (
        <g stroke={color} strokeWidth={1.2} fill="none">
          <path d="M0 4 q6.5 -3.6 13 0 t13 0" />
        </g>
      )}
      {family === 'fiber' && (
        <g stroke={color} strokeWidth={1.6}>
          <path d="M0 5.5 h26" strokeDasharray="0" />
        </g>
      )}
    </svg>
  );
}

export function Legend({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div className="pointer-events-none absolute bottom-24 left-16 z-20 hidden w-[188px] rounded-2xl border border-white/25 bg-[#050505] p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.85)] lg:block">
      <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/55">Infrastructure</div>
      <div className="mt-2 space-y-1.5">
        {KIND_ORDER.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <Glyph kind={k} color={KIND_COLOR[k]} />
            <span className="text-[10px] tracking-wide text-foreground/75">{KIND_META[k].label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[9px] uppercase tracking-[0.24em] text-muted-foreground/55">Link layer</div>
      <div className="mt-2 space-y-1.5">
        {TECH_ORDER.map((t) => (
          <div key={t} className="flex items-center gap-2">
            <TechGlyph tech={t} />
            <span className="text-[10px] tracking-wide text-foreground/75">{TECH_META[t].short}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 26 8" className="h-2 w-6 shrink-0">
            <path d="M0 4 h26" stroke="#fb7185" strokeWidth={1.4} strokeDasharray="3 3" />
          </svg>
          <span className="text-[10px] tracking-wide text-foreground/60">Blocked</span>
        </div>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 26 8" className="h-2 w-6 shrink-0">
            <path d="M0 4 h26" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.5} />
          </svg>
          <span className="text-[10px] tracking-wide text-foreground/60">Standby</span>
        </div>
      </div>
    </div>
  );
}
