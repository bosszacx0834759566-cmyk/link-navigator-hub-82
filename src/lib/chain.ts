/**
 * Site relay chains: LEO -> HAPS -> Drone -> Ground Station.
 *
 * The chain telemetry is solved once, in the mission state hook, and both the
 * 3D globe and the 2D map read the exact same values — so the Inspector shows
 * identical, real-time data in either view.
 */

import { ASSETS, ASSET_BY_ID } from '@/lib/ololink';
import type { ScenarioId } from '@/lib/ololink';

/** On-board storage of every HAPS / Drone, in terabytes. */
export const STORAGE_TB = 10;

export interface SiteChain {
  /** site number, e.g. "01" */
  key: string;
  hapsId: string;
  droneId: string;
  groundId: string;
}

function siteKeyFromName(name: string): string | null {
  const m = /(\d+)\s*$/.exec(name);
  return m ? m[1]!.padStart(2, '0') : null;
}

/** Chains assembled from the fleet by matching site numbers in asset names. */
export const SITES: SiteChain[] = (() => {
  const byKey = new Map<string, { haps?: string; drone?: string; ground?: string }>();
  for (const a of ASSETS) {
    if (a.kind !== 'haps' && a.kind !== 'drone' && a.kind !== 'ground') continue;
    const key = siteKeyFromName(a.name);
    if (!key) continue;
    const entry = byKey.get(key) ?? {};
    if (a.kind === 'haps') entry.haps = a.id;
    if (a.kind === 'drone') entry.drone = a.id;
    if (a.kind === 'ground') entry.ground = a.id;
    byKey.set(key, entry);
  }
  return [...byKey.entries()]
    .filter(([, v]) => v.haps && v.drone && v.ground)
    .map(([key, v]) => ({ key, hapsId: v.haps!, droneId: v.drone!, groundId: v.ground! }))
    .sort((a, b) => a.key.localeCompare(b.key));
})();

export const SITE_BY_ASSET: Record<string, SiteChain> = Object.fromEntries(
  SITES.flatMap((s) => [
    [s.hapsId, s],
    [s.droneId, s],
    [s.groundId, s],
  ])
);

/** Sites whose LEO feed is a given satellite (derived from live windows). */
export type DroneMode = 'Laser' | 'RF' | 'Microwave';

export interface ChainTelemetry {
  siteKey: string;
  /** satellite currently inside the HAPS communication window */
  leoId: string | null;
  /** LEO -> HAPS ingest, Gbps */
  hapsInGbps: number;
  /** cumulative data received by the HAPS from LEO, TB */
  hapsReceivedTb: number;
  hapsStoredTb: number;
  /** HAPS -> Drone, Gbps */
  droneInGbps: number;
  droneReceivedTb: number;
  droneStoredTb: number;
  droneMode: DroneMode;
  /** Drone -> Ground Station, Gbps */
  groundInGbps: number;
  groundReceivedTb: number;
  groundReceiving: boolean;
}

const MODE_BY_SCENARIO: Record<ScenarioId, DroneMode> = {
  clear: 'Laser',
  cloud: 'Laser',
  rain: 'Microwave',
  storm: 'RF',
};

const MODE_RATE: Record<DroneMode, number> = {
  Laser: 1,
  Microwave: 0.55,
  RF: 0.3,
};

function seedOf(key: string) {
  return [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function initialChain(site: SiteChain, scenario: ScenarioId): ChainTelemetry {
  const s = seedOf(site.key);
  return {
    siteKey: site.key,
    leoId: null,
    hapsInGbps: 0,
    hapsReceivedTb: +(((s % 17) / 10)).toFixed(2),
    hapsStoredTb: +(((s % 13) / 10)).toFixed(2),
    droneInGbps: 0,
    droneReceivedTb: +(((s % 11) / 10)).toFixed(2),
    droneStoredTb: +(((s % 7) / 10)).toFixed(2),
    droneMode: MODE_BY_SCENARIO[scenario],
    groundInGbps: 0,
    groundReceivedTb: +(((s % 19) / 10)).toFixed(2),
    groundReceiving: false,
  };
}

export function initialChains(scenario: ScenarioId): Record<string, ChainTelemetry> {
  return Object.fromEntries(SITES.map((s) => [s.key, initialChain(s, scenario)]));
}

const cap = (v: number) => Math.min(STORAGE_TB, Math.max(0, +v.toFixed(2)));

/**
 * Advance every chain by `dt` seconds using the live satellite windows and the
 * baseline link bandwidth of the active scenario.
 */
export function advanceChains(
  prev: Record<string, ChainTelemetry>,
  dt: number,
  ctx: { scenario: ScenarioId; baseBandwidth: number; windows: Record<string, string | null> }
): Record<string, ChainTelemetry> {
  const mode = MODE_BY_SCENARIO[ctx.scenario];
  const next: Record<string, ChainTelemetry> = {};

  for (const site of SITES) {
    const p = prev[site.key] ?? initialChain(site, ctx.scenario);
    const leoId = ctx.windows[site.hapsId] ?? null;
    const health = ASSET_BY_ID[site.droneId]?.health;
    const wobble = 0.9 + Math.random() * 0.2;

    const hapsIn = leoId ? +(ctx.baseBandwidth * wobble).toFixed(2) : 0;
    const droneIn = health === 'OFFLINE' ? 0 : +(hapsIn * MODE_RATE[mode]).toFixed(2);
    const groundIn = +(droneIn * 0.96).toFixed(2);

    // Gbps -> TB over dt seconds (1 TB = 8000 Gb)
    const tb = (gbps: number) => (gbps * dt) / 8000;

    next[site.key] = {
      siteKey: site.key,
      leoId,
      hapsInGbps: hapsIn,
      hapsReceivedTb: +(p.hapsReceivedTb + tb(hapsIn)).toFixed(2),
      hapsStoredTb: cap(p.hapsStoredTb + tb(hapsIn) - tb(droneIn)),
      droneInGbps: droneIn,
      droneReceivedTb: +(p.droneReceivedTb + tb(droneIn)).toFixed(2),
      droneStoredTb: cap(p.droneStoredTb + tb(droneIn) - tb(groundIn)),
      droneMode: mode,
      groundInGbps: groundIn,
      groundReceivedTb: +(p.groundReceivedTb + tb(groundIn)).toFixed(2),
      groundReceiving: groundIn > 0,
    };
  }
  return next;
}

export function chainForAsset(
  chains: Record<string, ChainTelemetry>,
  assetId: string
): { site: SiteChain; chain: ChainTelemetry } | null {
  const site = SITE_BY_ASSET[assetId];
  if (!site) return null;
  const chain = chains[site.key];
  return chain ? { site, chain } : null;
}
