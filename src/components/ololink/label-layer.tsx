'use client';

/**
 * Screen-space label layer with automatic decluttering.
 *
 * Labels are DOM elements in a single overlay above the canvas, so they always
 * face the camera and never rotate with the Earth. Every frame the projector:
 *   1. projects each registered anchor to screen space
 *   2. drops anchors hidden behind the globe or off-screen
 *   3. places labels greedily by priority, offsetting collisions to free slots
 *   4. draws a leader line whenever a label had to move off its anchor
 *   5. hides the least important labels when no readable slot remains
 *
 * Detail is progressive: `tier` decides whether the sub-caption and the
 * telemetry/communication lines are rendered at all.
 */

import { useFrame, useThree } from '@react-three/fiber';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import type { LodLevel } from '@/lib/layers';

export interface LabelSpec {
  id: string;
  text: string;
  /** secondary caption — shown from the regional tier up */
  sub?: string;
  /** telemetry / communication lines — shown at the local tier only */
  detail?: string[];
  color?: string;
  /** higher wins a contested slot; selection/hover should be >= 100 */
  priority: number;
  /** minimum tier at which this label may appear */
  minTier: LodLevel;
  emphasis?: boolean;
  getPosition: (out: THREE.Vector3) => THREE.Vector3 | null;
}

type Listener = () => void;

class LabelStore {
  specs = new Map<string, LabelSpec>();
  els = new Map<string, HTMLDivElement | null>();
  lines = new Map<string, SVGLineElement | null>();
  private listeners = new Set<Listener>();

  set(spec: LabelSpec) {
    const existed = this.specs.has(spec.id);
    const prev = this.specs.get(spec.id);
    this.specs.set(spec.id, spec);
    // only re-render the overlay when the rendered content actually changes
    if (
      !existed ||
      prev!.text !== spec.text ||
      prev!.sub !== spec.sub ||
      prev!.color !== spec.color ||
      prev!.emphasis !== spec.emphasis ||
      prev!.minTier !== spec.minTier ||
      (prev!.detail ?? []).join('|') !== (spec.detail ?? []).join('|')
    ) {
      this.notify();
    }
  }

  remove(id: string) {
    if (this.specs.delete(id)) {
      this.els.delete(id);
      this.lines.delete(id);
      this.notify();
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }
}

const StoreContext = createContext<LabelStore | null>(null);

export function useLabelStore() {
  return useContext(StoreContext);
}

/** Register a decluttered label from inside the Canvas. Pass null to remove it. */
export function useLabel(spec: LabelSpec | null) {
  const store = useLabelStore();
  const active = useRef<string | null>(null);

  useEffect(() => {
    if (!store) return;
    if (spec) {
      store.set(spec);
      active.current = spec.id;
    } else if (active.current) {
      store.remove(active.current);
      active.current = null;
    }
  });

  useEffect(() => {
    return () => {
      if (store && active.current) store.remove(active.current);
    };
  }, [store]);
}

const TIER_RANK: Record<LodLevel, number> = { global: 0, regional: 1, local: 2 };

/** Candidate label offsets in px, tried in order. */
const SLOTS: [number, number][] = [
  [0, -26],
  [0, -46],
  [0, 30],
  [56, -34],
  [-56, -34],
  [72, -58],
  [-72, -58],
  [0, 56],
  [92, 10],
  [-92, 10],
];

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Placed, b: Placed, pad = 4) {
  return (
    a.x - a.w / 2 - pad < b.x + b.w / 2 &&
    a.x + a.w / 2 + pad > b.x - b.w / 2 &&
    a.y - a.h - pad < b.y &&
    a.y + pad > b.y - b.h
  );
}

/** Hidden behind the globe? Tests the camera→anchor segment against the unit sphere. */
function occluded(cam: THREE.Vector3, p: THREE.Vector3, tmp: THREE.Vector3) {
  const dir = tmp.copy(p).sub(cam);
  const len = dir.length();
  if (len < 1e-6) return false;
  dir.multiplyScalar(1 / len);
  const t = -cam.dot(dir);
  if (t <= 0 || t >= len) return false;
  const closest = dir.multiplyScalar(t).add(cam).length();
  return closest < 0.992;
}

export function LabelProjector({ tier }: { tier: LodLevel }) {
  const store = useLabelStore();
  const { size } = useThree();
  const world = useRef(new THREE.Vector3());
  const proj = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());
  const placed = useRef<Placed[]>([]);

  useFrame(({ camera }) => {
    if (!store) return;
    const rank = TIER_RANK[tier];
    const candidates: {
      id: string;
      spec: LabelSpec;
      el: HTMLDivElement;
      sx: number;
      sy: number;
      depth: number;
    }[] = [];

    for (const [id, spec] of store.specs) {
      const el = store.els.get(id);
      const line = store.lines.get(id);
      const hide = () => {
        if (el) el.style.opacity = '0';
        if (line) line.style.opacity = '0';
      };
      if (!el) continue;
      if (TIER_RANK[spec.minTier] > rank && spec.priority < 100) {
        hide();
        continue;
      }
      const p = spec.getPosition(world.current);
      if (!p) {
        hide();
        continue;
      }
      if (occluded(camera.position, p, tmp.current)) {
        hide();
        continue;
      }
      proj.current.copy(p).project(camera);
      if (proj.current.z > 1 || Math.abs(proj.current.x) > 1.08 || Math.abs(proj.current.y) > 1.08) {
        hide();
        continue;
      }
      candidates.push({
        id,
        spec,
        el,
        sx: (proj.current.x * 0.5 + 0.5) * size.width,
        sy: (-proj.current.y * 0.5 + 0.5) * size.height,
        depth: camera.position.distanceTo(p),
      });
    }

    candidates.sort((a, b) =>
      b.spec.priority - a.spec.priority || a.depth - b.depth
    );

    placed.current.length = 0;
    for (const c of candidates) {
      const w = c.el.offsetWidth || 80;
      const h = c.el.offsetHeight || 16;
      let chosen: [number, number] | null = null;
      for (const [ox, oy] of SLOTS) {
        const box: Placed = { x: c.sx + ox, y: c.sy + oy, w, h };
        if (box.x - w / 2 < 4 || box.x + w / 2 > size.width - 4) continue;
        if (box.y - h < 4 || box.y > size.height - 4) continue;
        if (placed.current.some((q) => overlaps(box, q))) continue;
        chosen = [ox, oy];
        placed.current.push(box);
        break;
      }
      const line = store.lines.get(c.id);
      if (!chosen) {
        if (c.spec.priority >= 100) {
          chosen = SLOTS[0]!;
          placed.current.push({ x: c.sx + chosen[0], y: c.sy + chosen[1], w, h });
        } else {
          c.el.style.opacity = '0';
          if (line) line.style.opacity = '0';
          continue;
        }
      }

      const [ox, oy] = chosen;
      c.el.style.opacity = c.spec.priority >= 100 ? '1' : '0.9';
      c.el.style.transform = `translate3d(${c.sx + ox}px, ${c.sy + oy}px, 0) translate(-50%, -100%)`;
      c.el.style.zIndex = String(Math.round(100 - Math.min(99, c.depth * 12)));

      // leader line whenever the label sits away from its anchor
      const far = Math.abs(ox) > 12 || oy < -32 || oy > 20;
      if (line) {
        if (far) {
          line.setAttribute('x1', String(c.sx));
          line.setAttribute('y1', String(c.sy));
          line.setAttribute('x2', String(c.sx + ox));
          line.setAttribute('y2', String(c.sy + oy + 3));
          line.style.opacity = '0.42';
        } else {
          line.style.opacity = '0';
        }
      }
    }
  });

  return null;
}

/** Overlay host. Must wrap the Canvas so labels register through context. */
export function LabelLayer({
  tier,
  children,
}: {
  tier: LodLevel;
  children: ReactNode;
}) {
  const store = useMemo(() => new LabelStore(), []);
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(Array.from(store.specs.keys()));
    sync();
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
    };
  }, [store]);

  const rank = TIER_RANK[tier];

  return (
    <StoreContext.Provider value={store}>
      {children}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        <svg className="absolute inset-0 h-full w-full">
          {ids.map((id) => (
            <line
              key={id}
              ref={(el) => {
                store.lines.set(id, el);
              }}
              stroke="#7dd3fc"
              strokeWidth={0.7}
              strokeDasharray="2 3"
              style={{ opacity: 0 }}
            />
          ))}
        </svg>
        {ids.map((id) => {
          const spec = store.specs.get(id);
          if (!spec) return null;
          return (
            <div
              key={id}
              ref={(el) => {
                store.els.set(id, el);
              }}
              className="absolute left-0 top-0 select-none whitespace-nowrap text-center font-mono uppercase will-change-transform"
              style={{ opacity: 0, transition: 'opacity 220ms linear' }}
            >
              <div
                className={`text-[9px] leading-[1.35] tracking-[0.18em] ${
                  spec.emphasis ? 'text-foreground' : 'text-foreground/60'
                }`}
              >
                {spec.text}
              </div>
              {spec.sub && rank >= 1 && (
                <div
                  className="text-[8px] leading-[1.35] tracking-[0.16em]"
                  style={{ color: spec.color ?? '#7dd3fc', opacity: 0.7 }}
                >
                  {spec.sub}
                </div>
              )}
              {rank >= 2 &&
                spec.detail?.map((line) => (
                  <div
                    key={line}
                    className="text-[8px] leading-[1.35] tracking-[0.14em] text-foreground/40"
                  >
                    {line}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </StoreContext.Provider>
  );
}
