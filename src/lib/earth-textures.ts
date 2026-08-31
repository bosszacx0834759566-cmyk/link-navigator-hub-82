/**
 * Earth imagery sources — NASA Blue Marble (Visible Earth, "Blue Marble Next
 * Generation w/ Topography and Bathymetry", public domain).
 *
 * Level-of-detail pyramid used by BOTH the 3D globe and the 2D map so the two
 * views always read as the same planet:
 *
 *   global    → 8192 x 4096 Blue Marble albedo
 *   regional  → per-region native-resolution tiles (~2.6x the 8K density)
 *   local     → the same regional tile (highest imagery we hold)
 *
 * The tiles are cropped straight out of the 21600 x 10800 master, so zooming
 * into an operational region stays sharp without ever uploading a 21k texture
 * to the GPU.
 */

import blueMarbleUrl from '@/assets/earth-blue-marble-8k.jpg';
import tileThailandUrl from '@/assets/earth-tile-thailand.jpg';
import tileUnitedStatesUrl from '@/assets/earth-tile-united-states.jpg';

/** Global equirectangular albedo (NASA Blue Marble). */
export const EARTH_8K_URL: string = blueMarbleUrl;

export interface EarthTile {
  /** region id from REGIONS */
  region: string;
  url: string;
  /** geographic extent of the tile, degrees */
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export const EARTH_TILES: EarthTile[] = [
  {
    region: 'thailand',
    url: tileThailandUrl,
    lonMin: 76.7,
    lonMax: 124.7,
    latMin: 1.8,
    latMax: 25.8,
  },
  {
    region: 'united-states',
    url: tileUnitedStatesUrl,
    lonMin: -128.9,
    lonMax: -80.9,
    latMin: 27.6,
    latMax: 51.6,
  },
];

export const EARTH_TILE_BY_REGION: Record<string, EarthTile> = Object.fromEntries(
  EARTH_TILES.map((t) => [t.region, t])
);
