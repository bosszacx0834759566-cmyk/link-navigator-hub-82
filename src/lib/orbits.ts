/**
 * Visual orbital model for the LEO layer.
 *
 * NOTE: this is a *concept simulation* for visualisation only — circular
 * great-circle paths at accelerated rates. It is not a propagator, does not
 * use TLE/SGP4, and must not be presented as real satellite tracking.
 */

import * as THREE from 'three';
import { ASSETS, ASSET_BY_ID, SEGMENTS, type Asset } from '@/lib/ololink';
import { assetVec } from '@/lib/layers';

export interface OrbitElements {
  id: string;
  /** scene-space orbital radius */
  radius: number;
  /** in-plane basis: position = radius * (e1 cos t + e2 sin t) */
  e1: THREE.Vector3;
  e2: THREE.Vector3;
  /** radians per second of scene time */
  omega: number;
  /** starting true anomaly */
  phase: number;
}

const NORTH = new THREE.Vector3(0, 1, 0);

/** Build a great-circle orbit that passes through the asset's nominal position. */
function elementsFor(asset: Asset, index: number): OrbitElements {
  const base = new THREE.Vector3(...assetVec(asset));
  const radius = base.length();
  const e1 = base.clone().normalize();

  // eastward tangent at the nominal point
  const east = new THREE.Vector3().crossVectors(NORTH, e1);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
  east.normalize();
  const northTangent = new THREE.Vector3().crossVectors(e1, east).normalize();

  // per-satellite plane tilt gives the constellation varied inclinations
  const tilt = ((index % 4) - 1.5) * 0.42 + (asset.lat >= 0 ? 0.18 : -0.18);
  const e2 = east
    .clone()
    .multiplyScalar(Math.cos(tilt))
    .add(northTangent.multiplyScalar(Math.sin(tilt)))
    .normalize();

  // higher orbits move slower; periods are compressed for legibility
  const period = 112 + (radius - 1.1) * 260 + index * 7;

  return {
    id: asset.id,
    radius,
    e1,
    e2,
    omega: (Math.PI * 2) / period,
    phase: (index * 2.399) % (Math.PI * 2),
  };
}

export const SATELLITES: Asset[] = ASSETS.filter((a) => a.kind === 'satellite');

export const SAT_ORBITS: Record<string, OrbitElements> = Object.fromEntries(
  SATELLITES.map((a, i) => [a.id, elementsFor(a, i)])
);

/** Position of a satellite at scene time `t` (seconds). */
export function orbitPosition(el: OrbitElements, t: number, out = new THREE.Vector3()) {
  const a = el.phase + el.omega * t;
  return out
    .copy(el.e1)
    .multiplyScalar(Math.cos(a) * el.radius)
    .addScaledVector(el.e2, Math.sin(a) * el.radius);
}

/** Velocity direction along the orbit — used to orient the satellite body. */
export function orbitTangent(el: OrbitElements, t: number, out = new THREE.Vector3()) {
  const a = el.phase + el.omega * t;
  return out
    .copy(el.e1)
    .multiplyScalar(-Math.sin(a))
    .addScaledVector(el.e2, Math.cos(a))
    .normalize();
}

/** Static scene position for anything that does not orbit. */
export function staticPosition(asset: Asset) {
  return new THREE.Vector3(...assetVec(asset));
}

/**
 * Communication-window quality (0-1) between an orbiting satellite and a
 * fixed receiver: driven by the satellite's elevation above the receiver's
 * local horizon plus a slant-range penalty.
 */
export function windowScore(sat: THREE.Vector3, receiver: THREE.Vector3) {
  const up = receiver.clone().normalize();
  const toSat = sat.clone().sub(receiver);
  const range = toSat.length();
  if (range < 1e-5) return 0;
  const elevation = Math.asin(THREE.MathUtils.clamp(toSat.dot(up) / range, -1, 1));
  const elDeg = THREE.MathUtils.radToDeg(elevation);
  // usable above ~18 deg elevation, best overhead
  const el = THREE.MathUtils.smoothstep(elDeg, 18, 55);
  const rangeFactor = THREE.MathUtils.clamp(1 - (range - 0.2) / 1.1, 0, 1);
  return el * (0.35 + 0.65 * rangeFactor);
}

/** Receivers that can acquire a satellite downlink, with their candidate sats. */
export const DOWNLINK_TARGETS: { id: string; sats: string[] }[] = Array.from(
  SEGMENTS.reduce((map, s) => {
    const from = ASSET_BY_ID[s.from];
    if (from?.kind !== 'satellite') return map;
    const list = map.get(s.to) ?? [];
    list.push(s.from);
    map.set(s.to, list);
    return map;
  }, new Map<string, string[]>())
).map(([id, sats]) => ({ id, sats }));

/** Segment id for a satellite → receiver downlink, if one exists. */
export function downlinkSegmentId(satId: string, targetId: string) {
  return SEGMENTS.find((s) => s.from === satId && s.to === targetId)?.id ?? null;
}
