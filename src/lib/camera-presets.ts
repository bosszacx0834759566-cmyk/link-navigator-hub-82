/**
 * Smart camera presets.
 *
 * Every preset is a pre-designed, readable framing: an orbit target plus a
 * camera station derived from it. Free orbiting is untouched — presets simply
 * hand the operator a known-good vantage point instead of making them hunt
 * for one.
 */

import * as THREE from 'three';
import { geoOnShell, REGIONS } from '@/lib/layers';

export type PresetId = 'global' | 'thailand' | 'united-states' | 'orbit' | 'active-link';

export interface CameraView {
  target: THREE.Vector3;
  position: THREE.Vector3;
}

export interface CameraPreset {
  id: PresetId;
  label: string;
  short: string;
  hint: string;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'global', label: 'Global', short: 'GLB', hint: 'Whole network, both regions in frame' },
  { id: 'thailand', label: 'Thailand', short: 'TH', hint: 'Thailand operational stack' },
  { id: 'united-states', label: 'United States', short: 'US', hint: 'United States operational stack' },
  { id: 'orbit', label: 'Orbit', short: 'ORB', hint: 'LEO shell and orbital tracks' },
  { id: 'active-link', label: 'Active Link', short: 'LNK', hint: 'Frame the AI-selected route' },
];

const NORTH = new THREE.Vector3(0, 1, 0);
const S_UP = new THREE.Vector3();
const S_EAST = new THREE.Vector3();
const S_NORTH = new THREE.Vector3();

/**
 * Station the camera above `target`, tilted `tiltDeg` toward the pole and
 * `swingDeg` along the local east axis so the altitude stack is seen at an
 * angle rather than straight down (flat, unreadable) framing.
 */
export function stationInto(
  out: THREE.Vector3,
  target: THREE.Vector3,
  distance: number,
  tiltDeg = 22,
  swingDeg = 12
): THREE.Vector3 {
  S_UP.copy(target).normalize();
  S_EAST.crossVectors(NORTH, S_UP);
  if (S_EAST.lengthSq() < 1e-6) S_EAST.set(1, 0, 0);
  S_EAST.normalize();
  S_NORTH.crossVectors(S_UP, S_EAST).normalize();

  const tilt = THREE.MathUtils.degToRad(tiltDeg);
  const swing = THREE.MathUtils.degToRad(swingDeg);

  return out
    .copy(S_UP)
    .multiplyScalar(Math.cos(tilt) * Math.cos(swing))
    .addScaledVector(S_NORTH, Math.sin(tilt))
    .addScaledVector(S_EAST, Math.sin(swing))
    .setLength(distance);
}

export function stationFor(
  target: THREE.Vector3,
  distance: number,
  tiltDeg = 22,
  swingDeg = 12
): THREE.Vector3 {
  return stationInto(new THREE.Vector3(), target, distance, tiltDeg, swingDeg);
}

/** Readable framing over a lat/lon on the globe. */
export function geoView(lat: number, lon: number, distance: number, tiltDeg = 22): CameraView {
  const target = new THREE.Vector3(...geoOnShell(lat, lon, 1.06));
  return { target, position: stationFor(target, distance, tiltDeg) };
}

/** Framing that keeps an arbitrary point (asset, link midpoint) clearly visible. */
export function pointView(point: THREE.Vector3, distance: number, tiltDeg = 18): CameraView {
  const target = point.clone();
  const min = target.length() + 0.34;
  return { target, position: stationFor(target, Math.max(distance, min), tiltDeg) };
}

/**
 * Framing that fits a set of live points (an active route) in view: the target
 * is the centroid lifted back onto the network shell, and the distance is a
 * bounding-sphere fit for a 42 deg vertical FOV.
 */
export function fitView(points: THREE.Vector3[], tiltDeg = 20): CameraView | null {
  if (points.length === 0) return null;
  const centre = new THREE.Vector3();
  for (const p of points) centre.add(p);
  centre.multiplyScalar(1 / points.length);

  // lift the centroid out of the globe interior so the target sits on the network
  const shell = Math.max(1.06, ...points.map((p) => p.length()) ) * 0.72;
  const target = centre.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, 1) : centre.clone();
  if (target.length() < shell) target.setLength(shell);

  let radius = 0.35;
  for (const p of points) radius = Math.max(radius, p.distanceTo(target));

  // fit the bounding sphere in a 42 deg FOV, then stand off from Earth centre
  const fit = radius / Math.tan(THREE.MathUtils.degToRad(42 / 2) * 0.62);
  return {
    target,
    position: stationFor(target, Math.max(target.length() + 0.45, fit), tiltDeg, 10),
  };
}

/** The canonical "Operational View" — both regions readable across the Pacific. */
export const OPERATIONAL_VIEW: CameraView = {
  target: new THREE.Vector3(0, 0, 0),
  position: new THREE.Vector3(-2.807, 1.31, -0.123),
};

export function presetView(id: PresetId): CameraView | null {
  if (id === 'global') return { target: OPERATIONAL_VIEW.target.clone(), position: OPERATIONAL_VIEW.position.clone() };
  if (id === 'orbit') {
    return {
      target: new THREE.Vector3(0, 0, 0),
      position: new THREE.Vector3(...geoOnShell(28, 150, 1)).normalize().multiplyScalar(3.05),
    };
  }
  const region = REGIONS.find((r) => r.id === id);
  if (region) return geoView(region.lat, region.lon, 1.95, 24);
  return null; // 'active-link' is resolved from live route geometry
}
