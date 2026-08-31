/**
 * Shared 2D (equirectangular) projection helpers.
 *
 * The 2D operational map is a projection of the exact same mission state used
 * by the 3D globe — same assets, same live orbital positions, same links.
 */

import { ASSET_BY_ID, type Asset } from '@/lib/ololink';
import { SAT_ORBITS, orbitPosition } from '@/lib/orbits';

/** Map canvas dimensions in SVG user units (2:1 equirectangular). */
export const MAP_W = 1000;
export const MAP_H = 500;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Inverse of geoOnShell(): scene vector -> lat/lon degrees. */
export function vecToLatLon(x: number, y: number, z: number): LatLon {
  const r = Math.sqrt(x * x + y * y + z * z) || 1;
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI;
  let lon = (Math.atan2(z, -x) * 180) / Math.PI - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

/** lat/lon -> SVG coordinates. */
export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: ((lon + 180) / 360) * MAP_W,
    y: ((90 - lat) / 180) * MAP_H,
  };
}

/**
 * Scene clock shared by BOTH views, so satellite phase, contacts and every
 * derived state are identical and continuous when the operator switches
 * 3D <-> 2D. Pausing the mission freezes the clock for both views at once.
 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
let accumulated = 0;
let last = now();
let clockRunning = true;

export function sceneTime() {
  const t = now();
  if (clockRunning) accumulated += (t - last) / 1000;
  last = t;
  return accumulated;
}

/** Freeze / resume the shared clock (mission run state). */
export function setSceneRunning(v: boolean) {
  sceneTime();
  clockRunning = v;
}

/** Rewind the shared clock (mission reset). */
export function resetSceneTime() {
  accumulated = 0;
  last = now();
}


/** Live ground track of an asset — orbiting sats propagate, everything else is fixed. */
export function livePosition(asset: Asset, t: number): LatLon {
  if (asset.kind === 'satellite') {
    const el = SAT_ORBITS[asset.id];
    if (el) {
      const v = orbitPosition(el, t);
      return vecToLatLon(v.x, v.y, v.z);
    }
  }
  return { lat: asset.lat, lon: asset.lon };
}

export function livePositionById(id: string, t: number): LatLon | null {
  const a = ASSET_BY_ID[id];
  return a ? livePosition(a, t) : null;
}

/** Quadratic arc between two screen points (already antimeridian-corrected). */
export function arcPath(pa: { x: number; y: number }, pb: { x: number; y: number }): string {
  const mx = (pa.x + pb.x) / 2;
  const my = (pa.y + pb.y) / 2;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(34, len * 0.14);
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M ${pa.x.toFixed(2)} ${pa.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${pb.x.toFixed(2)} ${pb.y.toFixed(2)}`;
}
