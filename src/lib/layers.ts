/**
 * Visual altitude model + level-of-detail rules for the spatial view.
 *
 * IMPORTANT: these radii are deliberately NOT to physical scale. At true scale
 * HAPS (19 km) and relay drones (4 km) collapse onto the Earth surface and are
 * indistinguishable from ground stations. The visualisation therefore uses
 * exaggerated, evenly separated shells that preserve the conceptual hierarchy:
 *
 *   LEO satellite  →  HAPS  →  relay drone  →  ground station
 */

import type { Asset, AssetKind } from '@/lib/ololink';

export interface LayerDef {
  /** scene radius of the shell (Earth surface = 1) */
  radius: number;
  label: string;
  /** real-world altitude band, shown to the operator */
  altitude: string;
  color: string;
}

export const LAYER: Record<AssetKind, LayerDef> = {
  satellite: { radius: 1.3, label: 'LEO Satellite', altitude: '550 – 700 km', color: '#7dd3fc' },
  haps: { radius: 1.13, label: 'HAPS', altitude: '19 – 20 km', color: '#38bdf8' },
  drone: { radius: 1.055, label: 'Relay Drone', altitude: '4 km', color: '#a5b4fc' },
  ground: { radius: 1.0, label: 'Ground Station', altitude: 'Surface', color: '#34d399' },
  customer: { radius: 1.0, label: 'Customer Network', altitude: 'Surface', color: '#e2e8f0' },
};

/** Top-down order of the altitude stack. */
export const LAYER_STACK: AssetKind[] = ['satellite', 'haps', 'drone', 'ground'];

/** Exaggerated scene radius for an asset. */
export function layerRadius(asset: Asset): number {
  if (asset.kind === 'satellite') {
    // keep a little spread inside the LEO shell so orbits do not coincide
    return LAYER.satellite.radius + ((asset.altKm - 540) / 1000) * 0.42;
  }
  return LAYER[asset.kind].radius;
}

/** lat/lon on a shell of the given radius. */
export function geoOnShell(lat: number, lon: number, r: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Scene position of an asset on its visual altitude shell. */
export function assetVec(asset: Asset): [number, number, number] {
  return geoOnShell(asset.lat, asset.lon, layerRadius(asset));
}

/* ------------------------------------------------------------- regions */

export interface RegionDef {
  id: string;
  /** matches Asset.region */
  name: string;
  short: string;
  lat: number;
  lon: number;
  /** surface radius of the operational footprint */
  spread: number;
}

export const REGIONS: RegionDef[] = [
  { id: 'thailand', name: 'Thailand', short: 'TH', lat: 13.8, lon: 100.7, spread: 0.11 },
  { id: 'united-states', name: 'United States', short: 'US', lat: 39.6, lon: -104.9, spread: 0.12 },
];

export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r])
);

export function regionIdOf(asset: Asset): string | null {
  return REGIONS.find((r) => r.name === asset.region)?.id ?? null;
}

/* ------------------------------------------------------- level of detail */

export type LodLevel = 'global' | 'regional' | 'local';

/** Camera distance thresholds (distance from Earth centre). */
export const LOD_ENTER = { regional: 2.45, local: 1.85 };

export function lodForDistance(d: number): LodLevel {
  if (d > LOD_ENTER.regional) return 'global';
  if (d > LOD_ENTER.local) return 'regional';
  return 'local';
}

export const LOD_LABEL: Record<LodLevel, string> = {
  global: 'Global view',
  regional: 'Regional view',
  local: 'Local operational view',
};
