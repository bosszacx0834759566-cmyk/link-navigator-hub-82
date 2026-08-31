/**
 * 2D basemap: the same satellite albedo texture used by the 3D globe, with no
 * sun lighting, terminator or night-lights treatment — fully and evenly lit.
 */

import { EARTH_8K_URL } from '@/lib/earth-textures';

export function earthBasemap(): Promise<string> {
  return Promise.resolve(EARTH_8K_URL);
}
