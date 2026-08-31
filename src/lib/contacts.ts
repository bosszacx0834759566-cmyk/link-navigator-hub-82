/**
 * Shared contact solver.
 *
 * Both the 3D globe and the 2D operational map render *the same* communication
 * contacts. The solver is therefore view-independent: it is evaluated once, in
 * the mission state hook, from the shared scene clock, and both views only
 * project the result.
 */

import * as THREE from 'three';
import { ASSETS } from '@/lib/ololink';
import { SATELLITES, SAT_ORBITS, orbitPosition, staticPosition, windowScore } from '@/lib/orbits';

/** Receivers that can acquire a satellite contact. */
export const PASS_RECEIVERS = ASSETS.filter((a) => a.kind === 'ground' || a.kind === 'haps');

/** acquisition / loss-of-signal thresholds give the contacts hysteresis */
const ACQUIRE = 0.34;
const LOS = 0.16;

const RX_POS: Record<string, THREE.Vector3> = Object.fromEntries(
  PASS_RECEIVERS.map((a) => [a.id, staticPosition(a)])
);

export interface ContactSolution {
  /** `${satId}|${receiverId}` for every open contact */
  pairs: string[];
  /** receiverId -> satellite currently inside its communication window */
  windows: Record<string, string | null>;
}

/** Satellite scene positions at shared scene time `t`. */
export function satellitePositions(t: number): Map<string, THREE.Vector3> {
  const map = new Map<string, THREE.Vector3>();
  for (const s of SATELLITES) {
    const el = SAT_ORBITS[s.id];
    if (el) map.set(s.id, orbitPosition(el, t, new THREE.Vector3()));
  }
  return map;
}

/** Evaluate every contact at scene time `t`, holding open contacts via `held`. */
export function solveContacts(t: number, held: Set<string>): ContactSolution {
  const sats = satellitePositions(t);
  const pairs: string[] = [];
  const windows: Record<string, string | null> = {};

  for (const rx of PASS_RECEIVERS) {
    const rp = RX_POS[rx.id]!;
    let best: { id: string; score: number } | null = null;
    for (const s of SATELLITES) {
      const sp = sats.get(s.id);
      if (!sp) continue;
      const score = windowScore(sp, rp);
      const threshold = held.has(`${s.id}|${rx.id}`) ? LOS : ACQUIRE;
      if (score > threshold && (!best || score > best.score)) best = { id: s.id, score };
    }
    windows[rx.id] = best ? best.id : null;
    if (best) pairs.push(`${best.id}|${rx.id}`);
  }

  pairs.sort();
  return { pairs, windows };
}
