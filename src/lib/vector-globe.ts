/**
 * Procedural / vector Earth geometry — no imagery, no textures.
 *
 * Built once at module level from the public-domain Natural Earth 110m land
 * outlines (world-atlas, ~55 kB JSON, bundled at build time). Everything the
 * globe renders is generated geometry: filled land shells, coastline strokes
 * and a lat/lon graticule. This keeps the first paint instant and the frame
 * cost tiny compared with multi-megabyte equirectangular textures.
 */

import * as THREE from 'three';
import { feature } from 'topojson-client';
import landTopo from 'world-atlas/land-110m.json';

type Ring = [number, number][];

const DEG = Math.PI / 180;

/** lon/lat (degrees) -> scene vector, matching geoToVec() in the app. */
export function llToVec(lon: number, lat: number, r = 1): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

function landRings(): Ring[] {
  const topo = landTopo as unknown as { objects: Record<string, never> };
  const out = feature(topo as never, topo.objects['land'] as never) as unknown as
    | { type: 'Feature'; geometry: { type: string; coordinates: unknown } }
    | { type: 'FeatureCollection'; features: { geometry: { type: string; coordinates: unknown } }[] };

  const geoms =
    'features' in out ? out.features.map((f) => f.geometry) : [out.geometry];

  const rings: Ring[] = [];
  for (const g of geoms) {
    if (!g) continue;
    const polys: number[][][][] =
      g.type === 'Polygon'
        ? [g.coordinates as number[][][]]
        : (g.coordinates as number[][][][]);
    for (const poly of polys) for (const ring of poly) rings.push(ring as Ring);
  }
  return rings;
}

const RINGS = landRings();

/* ------------------------------------------------------------ coastlines */

export function coastlineGeometry(radius = 1.002): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const ring of RINGS) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = llToVec(ring[i]![0], ring[i]![1], radius);
      const b = llToVec(ring[i + 1]![0], ring[i + 1]![1], radius);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

/* ----------------------------------------------------------- filled land */

/**
 * Triangulates each land ring in lon/lat space, then subdivides every triangle
 * until its edges are short enough that projecting the corners onto the sphere
 * no longer cuts visibly through the surface.
 */
export function landGeometry(radius = 1.001, maxEdgeDeg = 5): THREE.BufferGeometry {
  const pos: number[] = [];

  const emit = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    depth: number
  ) => {
    const e = (p: [number, number], q: [number, number]) =>
      Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
    if (depth < 5 && Math.max(e(a, b), e(b, c), e(c, a)) > maxEdgeDeg) {
      const m = (p: [number, number], q: [number, number]): [number, number] => [
        (p[0] + q[0]) / 2,
        (p[1] + q[1]) / 2,
      ];
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      emit(a, ab, ca, depth + 1);
      emit(ab, b, bc, depth + 1);
      emit(ca, bc, c, depth + 1);
      emit(ab, bc, ca, depth + 1);
      return;
    }
    for (const p of [a, b, c]) {
      const v = llToVec(p[0], p[1], radius);
      pos.push(v.x, v.y, v.z);
    }
  };

  for (const ring of RINGS) {
    const pts = ring.slice(0, -1).map(([lon, lat]) => new THREE.Vector2(lon, lat));
    if (pts.length < 3) continue;
    let tris: number[][] = [];
    try {
      tris = THREE.ShapeUtils.triangulateShape(pts, []);
    } catch {
      continue;
    }
    for (const [i, j, k] of tris) {
      const a = pts[i!]!;
      const b = pts[j!]!;
      const c = pts[k!]!;
      emit([a.x, a.y], [b.x, b.y], [c.x, c.y], 0);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------ graticule */

export function graticuleGeometry(radius = 1.003, step = 15): THREE.BufferGeometry {
  const pos: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };
  // parallels
  for (let lat = -75; lat <= 75; lat += step) {
    for (let lon = -180; lon < 180; lon += 3) {
      push(llToVec(lon, lat, radius), llToVec(lon + 3, lat, radius));
    }
  }
  // meridians
  for (let lon = -180; lon < 180; lon += step) {
    for (let lat = -90; lat < 90; lat += 3) {
      push(llToVec(lon, lat, radius), llToVec(lon, lat + 3, radius));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}
