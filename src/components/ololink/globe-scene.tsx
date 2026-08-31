'use client';

import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';

import { Html, OrbitControls, Stars } from '@react-three/drei';
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';

import { EARTH_8K_URL, EARTH_TILE_BY_REGION, type EarthTile } from '@/lib/earth-textures';
import earthClouds from '@/assets/earth_clouds_1024.png';

import {
  ASSET_BY_ID,
  ASSETS,
  TECH_META,
  geoToVec,
  routeSegments,
  type Asset,
  type LinkState,
  type ScenarioProfile,
  type Segment,
  AMBIENT_CELLS,
  type WeatherCell,
} from '@/lib/ololink';
import type { OloLinkState, Selection } from '@/hooks/use-ololink';
import { sceneTime } from '@/lib/geo2d';
import { LabelLayer, LabelProjector, useLabel } from '@/components/ololink/label-layer';
import {
  
  OPERATIONAL_VIEW,
  fitView,
  pointView,
  presetView,
  stationInto,
  type CameraView,
  type PresetId,
} from '@/lib/camera-presets';
import {
  LAYER,
  LAYER_STACK,
  
  REGIONS,
  REGION_BY_ID,
  assetVec,
  geoOnShell,
  layerRadius,
  lodForDistance,
  regionIdOf,
  type LodLevel,
  type RegionDef,
} from '@/lib/layers';
import {
  SAT_ORBITS,
  SATELLITES,
  orbitPosition,
  orbitTangent,
  staticPosition,
  windowScore,
} from '@/lib/orbits';

/** Ground stations + the drone and HAPS flying above each of them. */
const SURFACE_STACK = ASSETS.filter(
  (a) => a.kind === 'ground' || a.kind === 'drone' || a.kind === 'haps'
);


/** Live scene positions for every asset — satellites are updated every frame. */
type LiveMap = Map<string, THREE.Vector3>;

function createLiveMap(): LiveMap {
  return new Map(ASSETS.map((a) => [a.id, staticPosition(a)]));
}

const CYAN = '#38bdf8';
const UP = new THREE.Vector3(0, 1, 0);

function vec(a: Asset) {
  return new THREE.Vector3(...assetVec(a));
}

/* --------------------------------------------------- level-of-detail ctx */

interface LodState {
  level: LodLevel;
  /** region the camera is currently looking at, if any */
  region: string | null;
}

const LodContext = createContext<LodState>({ level: 'global', region: null });
const useLod = () => useContext(LodContext);

/** Watches the camera and derives view level + focused region. */
function LodDriver({ onChange }: { onChange: (s: LodState) => void }) {
  const last = useRef<LodState>({ level: 'global', region: null });
  const dir = useRef(new THREE.Vector3());
  const normals = useMemo(
    () =>
      REGIONS.map((r) => ({
        id: r.id,
        n: new THREE.Vector3(...geoOnShell(r.lat, r.lon, 1)).normalize(),
      })),
    []
  );

  useFrame(({ camera }) => {
    const d = camera.position.length();
    const level = lodForDistance(d);
    dir.current.copy(camera.position).normalize();
    let region: string | null = null;
    let best = 0.62;
    for (const r of normals) {
      const dot = r.n.dot(dir.current);
      if (dot > best) {
        best = dot;
        region = r.id;
      }
    }
    if (level === 'global') region = null;
    if (last.current.level !== level || last.current.region !== region) {
      last.current = { level, region };
      onChange(last.current);
    }
  });
  return null;
}

/** Smoothly fades a group in/out so LOD changes never pop. */
function Fade({
  show,
  speed = 3.2,
  children,
}: {
  show: boolean;
  speed?: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const v = useRef(show ? 1 : 0);
  const mounted = useRef(show);
  const [alive, setAlive] = useState(show);

  useFrame((_, d) => {
    const g = group.current;
    v.current += ((show ? 1 : 0) - v.current) * Math.min(1, d * speed);
    if (!g) return;
    const a = v.current;
    g.visible = a > 0.015;
    g.scale.setScalar(0.92 + a * 0.08);
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      const apply = (mm: THREE.Material) => {
        const anyM = mm as THREE.Material & { userData: { base?: number }; opacity: number };
        if (anyM.userData.base === undefined) anyM.userData.base = anyM.opacity;
        anyM.transparent = true;
        anyM.opacity = anyM.userData.base * a;
      };
      Array.isArray(m) ? m.forEach(apply) : apply(m);
    });
    if (!show && a < 0.02 && mounted.current) {
      mounted.current = false;
      setAlive(false);
    } else if (show && !mounted.current) {
      mounted.current = true;
      setAlive(true);
    }
  });

  useEffect(() => {
    if (show) {
      mounted.current = true;
      setAlive(true);
    }
  }, [show]);

  if (!alive && !show) return null;
  return <group ref={group}>{children}</group>;
}

/** Quaternion that stands an object up on the sphere surface. */
function surfaceQuat(position: THREE.Vector3) {
  return new THREE.Quaternion().setFromUnitVectors(UP, position.clone().normalize());
}

const LIFT: Record<'optical' | 'radio' | 'fiber', number> = {
  optical: 0.05,
  radio: 0.34,
  fiber: 0.006,
};

function curveFor(from: Asset, to: Asset, family: 'optical' | 'radio' | 'fiber') {
  const a = vec(from);
  const b = vec(to);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const lift = 1 + a.distanceTo(b) * LIFT[family];
  mid.setLength(Math.max(a.length(), b.length()) * lift);
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

function curveForSegment(segment: Segment) {
  const from = ASSET_BY_ID[segment.from]!;
  const to = ASSET_BY_ID[segment.to]!;
  return curveFor(from, to, TECH_META[segment.tech].family);
}

/* ---------------------------------------------------------------- Earth */

/** Direction of the sun — chosen so the terminator crosses both regions. */
export const SUN_DIR = new THREE.Vector3(...geoToVec(14, 178, 0)).normalize();

const DEG = Math.PI / 180;

/**
 * Sharpens a texture for close-up viewing without inflating GPU memory:
 * trilinear mipmapping (so the 8K map does not shimmer when zoomed out) plus
 * hardware anisotropic filtering (so it stays crisp at grazing angles).
 */
function tuneEarthTexture(tex: THREE.Texture, maxAniso: number, srgb = true) {
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Native-resolution imagery patch laid over the 8K globe for the region the
 * camera is looking at. Only one tile is ever resident, so the extra GPU cost
 * is a single ~3k x 1.4k texture.
 */
function RegionTile({ tile }: { tile: EarthTile }) {
  const gl = useThree((s) => s.gl);
  const map = useLoader(THREE.TextureLoader, tile.url);
  useMemo(() => tuneEarthTexture(map, gl.capabilities.getMaxAnisotropy()), [map, gl]);

  const args = useMemo(
    () =>
      [
        1,
        96,
        96,
        (tile.lonMin + 180) * DEG,
        (tile.lonMax - tile.lonMin) * DEG,
        (90 - tile.latMax) * DEG,
        (tile.latMax - tile.latMin) * DEG,
      ] as const,
    [tile]
  );

  return (
    <mesh scale={1.0006} renderOrder={1}>
      <sphereGeometry args={[...args]} />
      <meshBasicMaterial
        map={map}
        toneMapped={false}
        color="#ffffff"
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

function Earth() {
  const gl = useThree((s) => s.gl);
  const { level, region } = useLod();
  const maps = useLoader(THREE.TextureLoader, [EARTH_8K_URL, earthClouds]);
  const day = maps[0]!;
  const clouds = maps[1]!;

  useMemo(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    tuneEarthTexture(day, maxAniso);
    tuneEarthTexture(clouds, maxAniso, false);
  }, [day, clouds, gl]);

  /** regional + local views get the native-resolution imagery tile */
  const tile = level !== 'global' && region ? EARTH_TILE_BY_REGION[region] : undefined;

  const cloudRef = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (cloudRef.current) cloudRef.current.rotation.y += d * 0.004;
  });

  return (
    <group>
      {/* surface: NASA Blue Marble albedo, unlit so the whole globe is evenly visible */}
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial map={day} toneMapped={false} color="#ffffff" />
      </mesh>

      {/* high-resolution regional imagery */}
      {tile ? (
        <Suspense fallback={null}>
          <RegionTile tile={tile} />
        </Suspense>
      ) : null}


      {/* cloud layer */}
      <mesh ref={cloudRef} scale={1.006}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshBasicMaterial
          map={clouds}
          alphaMap={clouds}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
          color="#ffffff"
        />
      </mesh>
      {/* inner atmosphere */}
      <mesh>
        <sphereGeometry args={[1.016, 64, 64]} />
        <meshBasicMaterial color="#4a86c8" transparent opacity={0.07} side={THREE.BackSide} />
      </mesh>
      {/* outer halo */}
      <mesh>
        <sphereGeometry args={[1.08, 64, 64]} />
        <meshBasicMaterial color="#1d4e8f" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}



/* --------------------------------------------- orbital trajectory rings */
/* Deliberately near-invisible: these are mechanics, not communication. */

function OrbitTrack({ elId }: { elId: string }) {
  const geometry = useMemo(() => {
    const el = SAT_ORBITS[elId]!;
    const pts = Array.from({ length: 181 }, (_, i) => {
      const a = (i / 180) * Math.PI * 2;
      return el.e1
        .clone()
        .multiplyScalar(Math.cos(a) * el.radius)
        .addScaledVector(el.e2, Math.sin(a) * el.radius);
    });
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.computeBoundingSphere();
    return g;
  }, [elId]);
  return (
    // @ts-expect-error three line primitive
    <line geometry={geometry}>
      <lineBasicMaterial color="#7dd3fc" transparent opacity={0.06} depthWrite={false} />
    </line>
  );
}

/**
 * Propagates the visual LEO model and evaluates communication windows.
 * Concept simulation only — circular paths, accelerated rates.
 */
function OrbitDriver({ live }: { live: LiveMap }) {
  useFrame(() => {
    const t = sceneTime();
    for (const sat of SATELLITES) {
      const el = SAT_ORBITS[sat.id];
      const target = live.get(sat.id);
      if (el && target) orbitPosition(el, t, target);
    }
  });

  return null;
}

/* --------------------------------------------------- link helper meshes */

function usePoints(curve: THREE.Curve<THREE.Vector3>, count = 72) {
  return useMemo(() => curve.getPoints(count), [curve, count]);
}

function SolidLine({
  points,
  color,
  opacity,
}: {
  points: THREE.Vector3[];
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  return (
    // @ts-expect-error three line primitive
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </line>
  );
}

/** Interrupted stroke — used for blocked / unavailable paths. */
function DashedLine({
  points,
  color,
  opacity,
  dash = 0.02,
  gap = 0.03,
}: {
  points: THREE.Vector3[];
  color: string;
  opacity: number;
  dash?: number;
  gap?: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);
  const ref = useRef<THREE.Object3D & { computeLineDistances?: () => void }>(null);
  useEffect(() => {
    (ref.current as unknown as THREE.Line | null)?.computeLineDistances();
  }, [geometry]);
  return (
    // @ts-expect-error three line primitive
    <line ref={ref} geometry={geometry}>
      <lineDashedMaterial
        color={color}
        transparent
        opacity={opacity}
        dashSize={dash}
        gapSize={gap}
        depthWrite={false}
      />
    </line>
  );
}

/**
 * Live pass contact: whenever a LEO rises above a receiver's horizon it
 * acquires the station and starts transmitting — downlink packets stream
 * sat → station, a fainter uplink pulse returns, and the whole contact fades
 * in and out with the pass geometry (elevation + slant range).
 */

/** LEO -> HAPS optical crosslink colour (straight green laser). */
const LASER_GREEN = '#22c55e';


function LaserBeam({
  satId,
  rxId,
  live,
}: {
  satId: string;
  rxId: string;
  live: LiveMap;
}) {
  // Thin straight green laser line (no glow, no cylinder effects).
  const lineRef = useRef<THREE.Line>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6), 3)
    );
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const from = live.get(satId);
    const to = live.get(rxId);
    if (!from || !to || !lineRef.current) return;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
  });

  return (
    <primitive
      object={useMemo(() => {
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: LASER_GREEN, transparent: true, opacity: 0.9 })
        );
        line.frustumCulled = false;
        return line;
      }, [geometry])}
      ref={lineRef}
    />
  );
}

function ContactNetwork({ live, contacts }: { live: LiveMap; contacts: string[] }) {
  return (
    <>
      {contacts
        .filter((key) => {
          const rxId = key.split('|')[1]!;
          return ASSET_BY_ID[rxId]?.kind === 'haps';
        })
        .map((key) => {
          const [satId, rxId] = key.split('|') as [string, string];
          return <LaserBeam key={key} satId={satId} rxId={rxId} live={live} />;
        })}
    </>
  );
}

/**
 * Live satellite downlink: geometry is re-sampled every frame from the moving
 * satellite, and the optical beam only exists inside a communication window.
 */
function DownlinkBeam({
  link,
  live,
  inWindow,
  selected,
  highlighted,
  onSelect,
}: {
  link: LinkState;
  live: LiveMap;
  inWindow: boolean;
  selected: boolean;
  highlighted: boolean;
  onSelect: (s: Selection) => void;
}) {
  const N = 40;
  const meta = TECH_META[link.segment.tech];
  const blocked = link.status === 'UNAVAILABLE';
  const degraded = link.status === 'DEGRADED';
  

  const core = useRef<THREE.Line>(null);
  const sheath = useRef<THREE.Line>(null);
  const packs = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const vis = useRef(0);
  const flow = useRef(Math.random());

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    return g;
  }, []);

  const scratch = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      p: new THREE.Vector3(),
      q: new THREE.Vector3(),
    }),
    []
  );

  useFrame((_, d) => {
    const from = live.get(link.segment.from);
    const to = live.get(link.segment.to);
    if (!from || !to) return;

    const { a, b, p, q } = scratch;
    a.copy(from);
    b.copy(to);

    // any LEO that is actually passing over the receiver transmits — not just
    // the single best-scoring satellite
    const pass = windowScore(a, b) > 0.16;
    const target = !blocked && (pass || inWindow) ? 1 : 0;
    vis.current += (target - vis.current) * Math.min(1, d * 1.8);
    flow.current = (flow.current + d * 0.5) % 1;

    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // straight line-of-sight beam
      p.copy(a).lerp(b, t);
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    attr.needsUpdate = true;

    const bezier = (t: number, out: THREE.Vector3) => out.copy(a).lerp(b, t);

    const boost = highlighted || selected ? 1.3 : 1;
    const v = vis.current;
    if (core.current) {
      const m = core.current.material as THREE.LineBasicMaterial;
      m.opacity = v * 0.85 * boost;
      m.color.set(degraded ? '#fcd34d' : '#e0f2fe');
      core.current.visible = v > 0.01;
    }
    if (sheath.current) {
      const m = sheath.current.material as THREE.LineBasicMaterial;
      // faint standby trace stays when the window is closed
      m.opacity = blocked ? 0.05 : 0.05 + v * 0.35 * boost;
      m.color.set(blocked ? '#fb7185' : degraded ? '#fbbf24' : meta.color);
    }
    if (packs.current) {
      packs.current.visible = v > 0.05;
      packs.current.children.forEach((child, i) => {
        const t = (flow.current + i / packs.current!.children.length) % 1;
        child.position.copy(bezier(t, q));
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = v * (0.5 + 0.5 * Math.sin(t * Math.PI)) * 0.95;
      });
    }
    if (hit.current) hit.current.position.copy(bezier(0.5, q));
  });

  return (
    <group>
      {/* @ts-expect-error three line primitive */}
      <line ref={sheath} geometry={geometry}>
        <lineBasicMaterial
          color={meta.color}
          transparent
          opacity={0.06}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </line>
      {/* @ts-expect-error three line primitive */}
      <line ref={core} geometry={geometry}>
        <lineBasicMaterial
          color="#e0f2fe"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </line>
      <group ref={packs}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.0045, 8, 8]} />
            <meshBasicMaterial
              color="#f0f9ff"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
      <mesh
        ref={hit}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect({ type: 'link', id: link.segment.id });
        }}
      >
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial
          color={meta.color}
          transparent
          opacity={selected ? 0.22 : 0.02}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Focused laser beam: thin straight line, no glow or packet effects. */
function OpticalBeam({
  curve,
  color,
  strength,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  color: string;
  strength: number;
}) {
  const points = usePoints(curve, 32);
  return <SolidLine points={points} color={color} opacity={0.85 * strength} />;
}

/** Radio / microwave: bowed corridor carrying expanding wavefronts. */
function RadioWave({
  curve,
  color,
  strength,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  color: string;
  strength: number;
}) {
  const points = usePoints(curve, 64);
  const rings = useRef<THREE.Group>(null);
  const offsets = useMemo(() => [0, 0.25, 0.5, 0.75], []);
  const t = useRef(Math.random());

  useFrame((_, d) => {
    t.current = (t.current + d * 0.24) % 1;
    if (!rings.current) return;
    rings.current.children.forEach((child, i) => {
      const p = (t.current + offsets[i]!) % 1;
      child.position.copy(curve.getPointAt(p));
      const tan = curve.getTangentAt(p);
      child.lookAt(child.position.clone().add(tan));
      const s = 0.6 + Math.sin(p * Math.PI) * 1.4;
      child.scale.setScalar(s);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(p * Math.PI) * 0.7 * strength;
    });
  });

  return (
    <group>
      <SolidLine points={points} color={color} opacity={0.5 * strength} />
      <mesh>
        <tubeGeometry args={[curve, 40, 0.014, 8, false]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.07 * strength}
          depthWrite={false}
        />
      </mesh>
      <group ref={rings}>
        {offsets.map((o) => (
          <mesh key={o}>
            <torusGeometry args={[0.014, 0.0022, 6, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Terrestrial fiber: steady surface-hugging conduit. */
function FiberRun({
  curve,
  color,
  strength,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  color: string;
  strength: number;
}) {
  const pulse = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random());
  useFrame((_, d) => {
    t.current = (t.current + d * 0.4) % 1;
    if (pulse.current) pulse.current.position.copy(curve.getPointAt(t.current));
  });
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 32, 0.0035, 6, false]} />
        <meshBasicMaterial color={color} transparent opacity={0.8 * strength} depthWrite={false} />
      </mesh>
      <mesh ref={pulse}>
        <sphereGeometry args={[0.007, 10, 10]} />
        <meshBasicMaterial color="#d1fae5" transparent opacity={0.9 * strength} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- links */

function LinkPath({
  link,
  selected,
  onRoute,
  highlighted,
  onSelect,
}: {
  link: LinkState;
  selected: boolean;
  onRoute: boolean;
  highlighted: boolean;
  onSelect: (s: Selection) => void;
}) {
  const meta = TECH_META[link.segment.tech];
  const curve = useMemo(() => curveForSegment(link.segment), [link.segment]);
  const points = usePoints(curve, 64);
  const active = link.status === 'ACTIVE';
  const degraded = link.status === 'DEGRADED';
  const rerouting = link.status === 'REROUTING';
  const blocked = link.status === 'UNAVAILABLE';
  const strength = highlighted || selected ? 1.35 : onRoute ? 1 : 0.75;

  return (
    <group>
      {active || rerouting || degraded ? (
        <group>
          {meta.family === 'optical' ? (
            <OpticalBeam
              curve={curve}
              color={rerouting ? '#e0f2fe' : degraded ? '#fbbf24' : meta.color}
              strength={degraded ? strength * 0.55 : strength}
            />
          ) : meta.family === 'fiber' ? (
            <FiberRun curve={curve} color={rerouting ? '#e0f2fe' : meta.color} strength={strength} />
          ) : (
            <RadioWave
              curve={curve}
              color={rerouting ? '#e0f2fe' : degraded ? '#fbbf24' : meta.color}
              strength={degraded ? strength * 0.6 : strength}
            />
          )}
          {degraded && (
            <DashedLine points={points} color="#fbbf24" opacity={0.32} dash={0.04} gap={0.03} />
          )}
        </group>
      ) : blocked ? (
        <group>
          <DashedLine points={points} color="#fb7185" opacity={selected ? 0.45 : 0.2} />
          <mesh position={curve.getPointAt(0.5)}>
            <sphereGeometry args={[0.006, 8, 8]} />
            <meshBasicMaterial color="#fb7185" transparent opacity={selected ? 0.8 : 0.35} />
          </mesh>
        </group>
      ) : (
        <DashedLine
          points={points}
          color={meta.color}
          opacity={selected ? 0.4 : 0.1}
          dash={0.05}
          gap={0.05}
        />

      )}

      {/* generous click target */}
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect({ type: 'link', id: link.segment.id });
        }}
      >
        <tubeGeometry args={[curve, 24, 0.016, 6, false]} />
        <meshBasicMaterial
          color={meta.color}
          transparent
          opacity={selected ? 0.16 : 0.01}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* -------------------------------------------- route reveal / route ghost */

function ProgressiveRoute({
  segments,
  seq,
  mode,
  color,
}: {
  segments: Segment[];
  seq: number;
  mode: 'in' | 'out';
  color: string;
}) {
  const geometries = useMemo(
    () =>
      segments.map((s) => {
        const pts = curveForSegment(s).getPoints(64);
        return new THREE.BufferGeometry().setFromPoints(pts);
      }),
    [segments]
  );
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);

  useEffect(() => {
    t.current = 0;
  }, [seq, segments]);

  useFrame((_, d) => {
    t.current = Math.min(1, t.current + d / (mode === 'in' ? 1.5 : 2.6));
    const g = group.current;
    if (!g) return;
    g.children.forEach((child, i) => {
      const line = child as THREE.Line;
      const total = 65;
      const span = 1 / Math.max(1, geometries.length);
      const local = Math.min(1, Math.max(0, (t.current - i * span) / span));
      const mat = line.material as THREE.LineBasicMaterial;
      if (mode === 'in') {
        line.geometry.setDrawRange(0, Math.round(total * local));
        mat.opacity = local * (1 - Math.max(0, t.current - 0.75) * 3.4) * 0.95;
      } else {
        line.geometry.setDrawRange(0, total);
        mat.opacity = Math.max(0, 0.5 * (1 - t.current));
      }
    });
  });

  return (
    <group ref={group}>
      {geometries.map((g, i) => (
        // @ts-expect-error three line primitive
        <line key={i} geometry={g}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            {...(mode === 'in' ? { blending: THREE.AdditiveBlending } : {})}
          />
        </line>
      ))}
    </group>
  );
}

/* -------------------------------------------------------- asset markers */

const KIND_COLOR: Record<Asset['kind'], string> = {
  satellite: '#7dd3fc',
  haps: '#38bdf8',
  drone: '#a5b4fc',
  ground: '#34d399',
  customer: '#e2e8f0',
};

/* Shared aerospace-grade material palette — lightweight, physically believable. */
const HULL = { color: '#d7dee6', metalness: 0.55, roughness: 0.42 } as const;
const DARK_HULL = { color: '#8b95a2', metalness: 0.6, roughness: 0.5 } as const;
const SOLAR = { color: '#16305e', metalness: 0.35, roughness: 0.28 } as const;
const GOLD_FOIL = { color: '#c8a24a', metalness: 0.85, roughness: 0.35 } as const;
const CONCRETE = { color: '#7b8590', metalness: 0.05, roughness: 0.95 } as const;

/**
 * LEO communications satellite — rectangular bus, two deployed solar wings,
 * nadir-pointing high-gain dish and a pair of comm antennas.
 * Nadir is -Y (the node frame is stood up on the sphere surface).
 */
function Satellite({ s, color }: { s: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    // slow yaw about the nadir axis — attitude control, not a spin
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.35;
  });
  return (
    <group ref={ref}>
      {/* spacecraft bus */}
      <mesh castShadow>
        <boxGeometry args={[s * 0.62, s * 0.78, s * 0.62]} />
        <meshStandardMaterial {...HULL} />
      </mesh>
      {/* MLI blanket band */}
      <mesh position={[0, s * 0.12, 0]}>
        <boxGeometry args={[s * 0.65, s * 0.22, s * 0.65]} />
        <meshStandardMaterial {...GOLD_FOIL} />
      </mesh>

      {/* solar wings: yoke + two panel sections per side */}
      {[-1, 1].map((dir) => (
        <group key={dir}>
          <mesh position={[dir * s * 0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[s * 0.035, s * 0.035, s * 0.25, 6]} />
            <meshStandardMaterial {...DARK_HULL} />
          </mesh>
          {[0.95, 1.85].map((off) => (
            <mesh key={off} position={[dir * s * off, 0, 0]}>
              <boxGeometry args={[s * 0.82, s * 0.02, s * 0.5]} />
              <meshStandardMaterial {...SOLAR} />
            </mesh>
          ))}
        </group>
      ))}

      {/* nadir high-gain dish */}
      <group position={[0, -s * 0.46, 0]} rotation={[Math.PI, 0, 0]}>
        <mesh>
          <sphereGeometry args={[s * 0.3, 16, 8, 0, Math.PI * 2, 0, 0.72]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, s * 0.18, 0]}>
          <cylinderGeometry args={[s * 0.03, s * 0.05, s * 0.16, 6]} />
          <meshStandardMaterial {...HULL} />
        </mesh>
      </group>

      {/* comm antennas / boom */}
      {[-1, 1].map((dir) => (
        <mesh key={dir} position={[0, -s * 0.18, dir * s * 0.36]} rotation={[dir * 0.5, 0, 0]}>
          <cylinderGeometry args={[s * 0.012, s * 0.012, s * 0.42, 4]} />
          <meshStandardMaterial {...DARK_HULL} />
        </mesh>
      ))}
    </group>
  );
}

/** Slowly turning propeller disc used by both aircraft. */
function Prop({ r, speed, thick }: { r: number; speed: number; thick: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.z += d * speed;
  });
  return (
    <group ref={ref}>
      {[0, Math.PI / 2].map((a) => (
        <mesh key={a} rotation={[0, 0, a]}>
          <boxGeometry args={[r * 2, thick, thick * 0.6]} />
          <meshStandardMaterial color="#aab4c0" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * HAPS — solar-electric stratospheric fixed-wing platform (~18–20 km).
 * Extreme-aspect-ratio single wing, slender fuselage pod, T-tail, prop array.
 */
function Haps({ s, color }: { s: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!ref.current) return;
    // wide, slow station-keeping orbit with a gentle bank
    ref.current.rotation.y = t * 0.16;
    ref.current.rotation.z = 0.12;
    ref.current.position.y = Math.sin(t * 0.35) * s * 0.08;
  });
  const span = s * 3.4;
  return (
    <group ref={ref}>
      {/* high-aspect-ratio wing with solar-cell upper surface */}
      <mesh>
        <boxGeometry args={[span, s * 0.035, s * 0.34]} />
        <meshStandardMaterial color="#e7edf3" metalness={0.2} roughness={0.55} />
      </mesh>
      <mesh position={[0, s * 0.026, 0]}>
        <boxGeometry args={[span * 0.97, s * 0.008, s * 0.28]} />
        <meshStandardMaterial {...SOLAR} />
      </mesh>
      {/* slender fuselage pod */}
      <mesh position={[0, -s * 0.07, s * 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[s * 0.07, s * 0.72, 3, 8]} />
        <meshStandardMaterial {...HULL} />
      </mesh>
      {/* tail boom + T-tail */}
      <mesh position={[0, -s * 0.05, -s * 0.62]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[s * 0.022, s * 0.022, s * 0.8, 6]} />
        <meshStandardMaterial {...DARK_HULL} />
      </mesh>
      <mesh position={[0, s * 0.14, -s * 1]}>
        <boxGeometry args={[s * 0.03, s * 0.28, s * 0.16]} />
        <meshStandardMaterial {...HULL} />
      </mesh>
      <mesh position={[0, s * 0.27, -s * 1]}>
        <boxGeometry args={[s * 0.8, s * 0.02, s * 0.16]} />
        <meshStandardMaterial {...HULL} />
      </mesh>
      {/* distributed electric propulsion */}
      {[-1.25, -0.55, 0.55, 1.25].map((x) => (
        <group key={x} position={[s * x, -s * 0.01, s * 0.24]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.035, s * 0.035, s * 0.14, 6]} />
            <meshStandardMaterial {...DARK_HULL} />
          </mesh>
          <group position={[0, 0, s * 0.09]}>
            <Prop r={s * 0.17} speed={12} thick={s * 0.018} />
          </group>
        </group>
      ))}
      {/* belly comms payload */}
      <mesh position={[0, -s * 0.16, s * 0.06]}>
        <sphereGeometry args={[s * 0.075, 10, 8]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Relay UAV — compact low-altitude fixed-wing aircraft: short stubby wings,
 * pusher prop, V-tail. Deliberately distinct from the HAPS glider.
 */
function Drone({ s, color }: { s: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!ref.current) return;
    ref.current.rotation.y = t * 0.55; // tight loiter orbit
    ref.current.rotation.z = 0.28; // banked into the turn
  });
  return (
    <group ref={ref}>
      {/* fuselage */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[s * 0.14, s * 0.72, 4, 10]} />
        <meshStandardMaterial color="#c3ccd6" metalness={0.45} roughness={0.5} />
      </mesh>
      {/* nose sensor turret */}
      <mesh position={[0, -s * 0.1, s * 0.42]}>
        <sphereGeometry args={[s * 0.1, 10, 8]} />
        <meshStandardMaterial color="#3b4652" metalness={0.5} roughness={0.35} />
      </mesh>
      {/* short straight wings */}
      <mesh position={[0, s * 0.05, s * 0.02]}>
        <boxGeometry args={[s * 1.7, s * 0.035, s * 0.26]} />
        <meshStandardMaterial color="#e7edf3" metalness={0.25} roughness={0.55} />
      </mesh>
      {/* winglets */}
      {[-1, 1].map((dir) => (
        <mesh key={dir} position={[dir * s * 0.84, s * 0.12, s * 0.02]}>
          <boxGeometry args={[s * 0.025, s * 0.16, s * 0.2]} />
          <meshStandardMaterial {...HULL} />
        </mesh>
      ))}
      {/* V-tail */}
      {[-1, 1].map((dir) => (
        <mesh key={dir} position={[dir * s * 0.16, s * 0.12, -s * 0.44]} rotation={[0, 0, dir * 0.7]}>
          <boxGeometry args={[s * 0.04, s * 0.34, s * 0.18]} />
          <meshStandardMaterial {...HULL} />
        </mesh>
      ))}
      {/* pusher prop */}
      <group position={[0, 0, -s * 0.56]}>
        <Prop r={s * 0.22} speed={26} thick={s * 0.022} />
      </group>
      {/* belly relay antenna */}
      <mesh position={[0, -s * 0.18, -s * 0.05]}>
        <cylinderGeometry args={[s * 0.07, s * 0.09, s * 0.1, 8]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Ground station — concrete pad, equipment shelter and a steerable parabolic
 * dish on an elevation/azimuth pedestal, tracking the active link.
 */
function GroundStation({ s, color }: { s: number; color: string }) {
  const az = useRef<THREE.Group>(null);
  const el = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // slow az/el tracking sweep toward the overhead link
    if (az.current) az.current.rotation.y = Math.sin(t * 0.16) * 0.9;
    if (el.current) el.current.rotation.x = -0.95 + Math.sin(t * 0.11) * 0.18;
  });
  return (
    <group>
      {/* concrete pad */}
      <mesh position={[0, s * 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[s * 0.95, s * 1, s * 0.06, 16]} />
        <meshStandardMaterial {...CONCRETE} />
      </mesh>
      {/* equipment shelter + mast */}
      <mesh position={[s * 0.6, s * 0.16, s * 0.25]} castShadow>
        <boxGeometry args={[s * 0.34, s * 0.2, s * 0.26]} />
        <meshStandardMaterial color="#9aa5b1" metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh position={[-s * 0.62, s * 0.3, -s * 0.2]}>
        <cylinderGeometry args={[s * 0.015, s * 0.015, s * 0.55, 5]} />
        <meshStandardMaterial {...DARK_HULL} />
      </mesh>

      {/* az/el pedestal */}
      <group ref={az} position={[0, s * 0.06, 0]}>
        <mesh position={[0, s * 0.16, 0]} castShadow>
          <cylinderGeometry args={[s * 0.11, s * 0.16, s * 0.32, 10]} />
          <meshStandardMaterial {...HULL} />
        </mesh>
        <group ref={el} position={[0, s * 0.36, 0]}>
          {/* parabolic reflector */}
          <mesh castShadow>
            <sphereGeometry args={[s * 0.5, 20, 10, 0, Math.PI * 2, 0, 0.78]} />
            <meshStandardMaterial
              color="#eef3f8"
              metalness={0.35}
              roughness={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* feed support struts + feed horn */}
          {[0, 2.1, 4.2].map((a) => (
            <mesh
              key={a}
              position={[Math.cos(a) * s * 0.2, s * 0.24, Math.sin(a) * s * 0.2]}
              rotation={[0, 0, Math.cos(a) * 0.35]}
            >
              <cylinderGeometry args={[s * 0.012, s * 0.012, s * 0.42, 4]} />
              <meshStandardMaterial {...DARK_HULL} />
            </mesh>
          ))}
          <mesh position={[0, s * 0.44, 0]}>
            <cylinderGeometry args={[s * 0.05, s * 0.07, s * 0.12, 8]} />
            <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  );
}


function CustomerNode({ s, color }: { s: number; color: string }) {
  return (
    <group>
      {/* endpoint hub */}
      <mesh position={[0, s * 0.3, 0]}>
        <boxGeometry args={[s * 0.6, s * 0.6, s * 0.6]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function AssetNode({
  asset,
  selected,
  onRoute,
  onSelect,
  showLabel,
  live,
  linking,
  tether,
  detail,
}: {
  asset: Asset;
  selected: boolean;
  onRoute: boolean;
  onSelect: (s: Selection) => void;
  showLabel: boolean;
  live: LiveMap;
  /** node is inside an active communication window */
  linking?: boolean;
  /** draw a plumb line down to the surface so altitude is readable */
  tether?: boolean;
  /** show the altitude-layer caption under the name */
  detail?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const position = useMemo(() => vec(asset), [asset]);
  const quat = useMemo(() => surfaceQuat(position), [position]);
  const body = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const orbiting = asset.kind === 'satellite';
  const color = selected || hover ? '#ffffff' : linking ? '#e0f2fe' : KIND_COLOR[asset.kind];

  const s =
    asset.kind === 'satellite'
      ? 0.021
      : asset.kind === 'haps'
        ? 0.018
        : asset.kind === 'drone'
          ? 0.013
          : 0.015;

  /** plumb line from the asset's shell down to the surface below it */
  const tetherGeom = useMemo(() => {
    if (!tether || asset.altKm <= 0) return null;
    const top = new THREE.Vector3(0, 0, 0);
    const bottom = new THREE.Vector3(0, -(layerRadius(asset) - 1), 0);
    return new THREE.BufferGeometry().setFromPoints([top, bottom]);
  }, [tether, asset]);

  useFrame(({ clock, camera }) => {
    if (root.current) {
      const p = live.get(asset.id);
      if (p) {
        root.current.position.copy(p);
        if (orbiting) root.current.quaternion.copy(surfaceQuat(p));
      }
    }
    if (body.current) {
      const target = selected ? 1.45 : hover ? 1.2 : 1;
      body.current.scale.lerp(new THREE.Vector3(target, target, target), 0.12);
    }
  });

  /* label rendering is delegated to the decluttered screen-space layer */
  useLabel(
    showLabel || hover || selected
      ? {
          id: `asset-${asset.id}`,
          text: asset.name,
          sub: `${LAYER[asset.kind].label} · ${LAYER[asset.kind].altitude}`,
          detail: [
            asset.role,
            `${asset.health} · ${asset.altKm > 0 ? `${asset.altKm} km` : 'surface'}`,
            linking ? 'Comm window active' : '',
          ].filter(Boolean) as string[],
          color: LAYER[asset.kind].color,
          priority: selected
            ? 130
            : hover
              ? 120
              : onRoute
                ? 70
                : linking
                  ? 60
                  : asset.kind === 'ground'
                    ? 45
                    : asset.kind === 'satellite'
                      ? 30
                      : 25,
          minTier:
            asset.kind === 'satellite' || asset.kind === 'ground'
              ? 'global'
              : asset.kind === 'customer'
                ? 'local'
                : 'regional',
          emphasis: selected || hover || onRoute,
          getPosition: (out) => {
            const p = live.get(asset.id);
            if (!p) return null;
            return out.copy(p).setLength(p.length() + s * 3.4);
          },
        }
      : null
  );

  return (
    <group ref={root} position={position} quaternion={quat}>
      <group
        ref={body}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect({ type: 'asset', id: asset.id });
        }}
      >
        {/* invisible hit sphere so tiny models stay clickable */}
        <mesh visible={false}>
          <sphereGeometry args={[s * 2.2, 8, 8]} />
        </mesh>
        {asset.kind === 'satellite' ? (
          <Satellite s={s} color={color} />
        ) : asset.kind === 'haps' ? (
          <Haps s={s} color={color} />
        ) : asset.kind === 'drone' ? (
          <Drone s={s} color={color} />
        ) : asset.kind === 'ground' ? (
          <GroundStation s={s} color={color} />
        ) : (
          <CustomerNode s={s} color={color} />
        )}
      </group>

      {tetherGeom && (
        // @ts-expect-error three line primitive
        <line geometry={tetherGeom}>
          <lineBasicMaterial
            color={KIND_COLOR[asset.kind]}
            transparent
            opacity={selected || onRoute ? 0.28 : 0.12}
            depthWrite={false}
          />
        </line>
      )}

    </group>
  );
}

/* -------------------------------------------------------------- weather */

function WeatherBlob({ cell }: { cell: WeatherCell }) {
  const position = useMemo(() => new THREE.Vector3(...geoToVec(cell.lat, cell.lon, 4)), [cell]);
  const ref = useRef<THREE.Group>(null);
  const color = cell.kind === 'STORM' ? '#f43f5e' : cell.kind === 'RAIN' ? '#38bdf8' : '#cbd5e1';

  useFrame(({ clock }) => {
    if (ref.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 1.2 + cell.lat) * 0.06;
      ref.current.scale.setScalar(p);
      ref.current.rotation.y += 0.0008;
    }
  });

  return (
    <group ref={ref} position={position}>
      <mesh>
        <sphereGeometry args={[cell.size * 0.5, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05 + cell.severity / 2200}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[cell.size * 0.3, 20, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <AffectedFootprint cell={cell} color={color} />
    </group>
  );
}

/** Ground footprint of a weather cell — the area operators must route around. */
function AffectedFootprint({ cell, color }: { cell: WeatherCell; color: string }) {
  const position = useMemo(
    () => new THREE.Vector3(...geoToVec(cell.lat, cell.lon, 0)).multiplyScalar(1.002),
    [cell]
  );
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize());
    return q;
  }, [position]);
  const ring = useRef<THREE.Mesh>(null);
  const r = cell.size * 0.62;

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const p = (clock.elapsedTime * 0.4 + cell.lon * 0.01) % 1;
    ring.current.scale.setScalar(0.6 + p * 0.6);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.45;
  });

  return (
    <group position={position.clone().sub(new THREE.Vector3(...geoToVec(cell.lat, cell.lon, 4)))} quaternion={quat}>
      <mesh>
        <ringGeometry args={[r * 0.92, r, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[r * 0.96, r, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}


/* ------------------------------------------------ global-view abstractions */

/** Operational region badge shown when the Earth is viewed from far away. */
function RegionMarker({
  region,
  counts,
  onFocus,
}: {
  region: RegionDef;
  counts: { assets: number; ground: number };
  onFocus: (r: RegionDef) => void;
}) {
  const [hover, setHover] = useState(false);
  const position = useMemo(
    () => new THREE.Vector3(...geoOnShell(region.lat, region.lon, 1.004)),
    [region]
  );
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), position.clone().normalize());
    return q;
  }, [position]);
  const pulse = useRef<THREE.Mesh>(null);
  const r = region.spread;

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const t = (clock.elapsedTime * 0.45) % 1;
    pulse.current.scale.setScalar(0.7 + t * 0.9);
    (pulse.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.5;
  });

  return (
    <group position={position} quaternion={quat}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onFocus(region);
        }}
      >
        <circleGeometry args={[r * 1.15, 40]} />
        <meshBasicMaterial color={CYAN} transparent opacity={hover ? 0.12 : 0.05} depthWrite={false} />
      </mesh>
      <mesh>
        <ringGeometry args={[r * 0.94, r, 64]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={pulse}>
        <ringGeometry args={[r * 0.97, r, 64]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Simplified trunk corridor between two operational regions (global view). */
function TrunkRoute({ a, b }: { a: RegionDef; b: RegionDef }) {
  const curve = useMemo(() => {
    const p = new THREE.Vector3(...geoOnShell(a.lat, a.lon, 1.01));
    const q = new THREE.Vector3(...geoOnShell(b.lat, b.lon, 1.01));
    const mid = p.clone().add(q).multiplyScalar(0.5).setLength(1.42);
    return new THREE.QuadraticBezierCurve3(p, mid, q);
  }, [a, b]);
  const packs = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_, d) => {
    t.current = (t.current + d * 0.13) % 1;
    packs.current?.children.forEach((child, i) => {
      const p = (t.current + i / 3) % 1;
      child.position.copy(curve.getPointAt(p));
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(p * Math.PI) * 0.9;
    });
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 64, 0.0035, 6, false]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={packs}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color="#e0f2fe" transparent opacity={0.8} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------ vertical layer scaffold */

/**
 * The altitude ladder over an operational region: one disc per visual layer
 * plus a vertical spine, so the operator can read which shell an asset is on.
 */
function LayerScaffold({ region, detailed }: { region: RegionDef; detailed: boolean }) {
  const normal = useMemo(
    () => new THREE.Vector3(...geoOnShell(region.lat, region.lon, 1)).normalize(),
    [region]
  );
  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    [normal]
  );

  const spine = useMemo(() => {
    const pts = [
      normal.clone().multiplyScalar(1.0),
      normal.clone().multiplyScalar(LAYER.satellite.radius + 0.03),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [normal]);

  return (
    <group>
      {/* @ts-expect-error three line primitive */}
      <line geometry={spine}>
        <lineDashedMaterial color="#7dd3fc" transparent opacity={0.16} depthWrite={false} />
      </line>

      {LAYER_STACK.map((kind) => {
        const def = LAYER[kind];
        const r = def.radius;
        const disc = region.spread * (0.9 + (r - 1) * 1.5);
        const center = normal.clone().multiplyScalar(r);
        return (
          <group key={kind} position={center} quaternion={quat}>
            <mesh>
              <ringGeometry args={[disc * 0.985, disc, 72]} />
              <meshBasicMaterial
                color={def.color}
                transparent
                opacity={0.26}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh>
              <circleGeometry args={[disc, 48]} />
              <meshBasicMaterial
                color={def.color}
                transparent
                opacity={0.035}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {detailed && (
              <Html
                center
                distanceFactor={1.5}
                position={[-disc * 1.22, 0, 0]}
                zIndexRange={[14, 0]}
              >
                <div className="pointer-events-none whitespace-nowrap text-right font-mono uppercase">
                  <div
                    className="text-[9px] tracking-[0.2em]"
                    style={{ color: def.color, opacity: 0.9 }}
                  >
                    {def.label}
                  </div>
                  <div className="text-[8px] tracking-[0.18em] text-foreground/40">
                    {def.altitude}
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* --------------------------------------------------------- camera focus */

function CameraRig({
  focusIds,
  live,
  approach,
  controls,
  view,
  onArrive,
}: {
  focusIds: string[] | null;
  live: LiveMap;
  approach: number;
  controls: React.RefObject<any>;
  /** one-shot smooth transition to a pre-designed readable framing */
  view: CameraView | null;
  onArrive: () => void;
}) {
  const desired = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  useFrame(({ camera }, d) => {
    const c = controls.current;
    if (!c) return;
    const k = 1 - Math.exp(-2.6 * d);

    if (view) {
      c.target.lerp(view.target, k * 0.9);
      camera.position.lerp(view.position, k * 0.85);
      c.update();
      if (
        camera.position.distanceTo(view.position) < 0.03 &&
        c.target.distanceTo(view.target) < 0.03
      ) {
        onArrive();
      }
      return;
    }

    if (focusIds && focusIds.length) {
      target.current.set(0, 0, 0);
      let n = 0;
      for (const id of focusIds) {
        const p = live.get(id);
        if (p) {
          target.current.add(p);
          n += 1;
        }
      }
      if (n === 0) return;
      target.current.multiplyScalar(1 / n);
      const t = target.current;
      c.target.lerp(t, k);
      // rotate + zoom so the selection sits clearly off the limb, never edge-on
      const dist = Math.max(1.52, t.length() + approach);
      stationInto(desired.current, t, dist, 18, 10);
      camera.position.lerp(desired.current, k * 0.95);
    } else {
      c.target.lerp(new THREE.Vector3(0, 0, 0), k * 0.6);
    }
    c.update();
  });
  return null;
}

/* ------------------------------------------------------------ the scene */

function SceneContent({
  state,
  onLod,
  preset,
  presetSeq,
  onPresetDone,
}: {
  state: OloLinkState;
  onLod: (s: LodState) => void;
  preset: PresetId | null;
  presetSeq: number;
  onPresetDone: () => void;
}) {
  const { profile, links, selection, select, layers, route, previousRoute, rerouteSeq } = state;
  const controls = useRef<any>(null);

  const routeSegmentIds = useMemo(() => new Set(route.map((s) => s.id)), [route]);
  const routeAssets = useMemo(() => new Set(profile.route), [profile]);

  /** selecting a link on the active route lights the whole path */
  const highlightIds = useMemo(() => {
    if (selection?.type !== 'link') return new Set<string>();
    if (routeSegmentIds.has(selection.id)) return routeSegmentIds;
    return new Set([selection.id]);
  }, [selection, routeSegmentIds]);

  const live = useMemo(createLiveMap, []);

  /** satellites currently holding a communication window, by receiver */
  const windowSats = useMemo(
    () => new Set(Object.values(state.windows).filter(Boolean) as string[]),
    [state.windows]
  );
  const windowReceivers = useMemo(
    () => new Set(Object.entries(state.windows).filter(([, v]) => v).map(([k]) => k)),
    [state.windows]
  );

  const focus = useMemo(() => {
    if (!selection) return null;
    if (selection.type === 'asset') return [selection.id];
    const l = links.find((x) => x.segment.id === selection.id);
    if (!l) return null;
    return [l.segment.from, l.segment.to];
  }, [selection, links]);

  const approach = selection?.type === 'asset' ? 0.42 : 0.85;

  /* ------------------------------------------------------ level of detail */

  const [lod, setLod] = useState<LodState>({ level: 'global', region: null });
  const [view, setView] = useState<CameraView | null>(null);

  useEffect(() => {
    onLod(lod);
  }, [lod, onLod]);

  /* smart camera presets -> a pre-designed readable framing */
  useEffect(() => {
    if (!preset) return;
    if (preset === 'active-link') {
      const points: THREE.Vector3[] = [];
      for (const id of profile.route) {
        const p = live.get(id);
        if (p) points.push(p.clone());
      }
      const v = fitView(points, 20);
      if (v) setView(v);
    } else {
      const v = presetView(preset);
      if (v) setView(v);
    }
    select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, presetSeq]);

  /** the region the operator is working in: camera-derived, or the selection's */
  const activeRegion = useMemo(() => {
    if (selection?.type === 'asset') {
      const r = ASSET_BY_ID[selection.id];
      if (r) return regionIdOf(r) ?? lod.region;
    }
    return lod.region;
  }, [selection, lod.region]);

  const detailed = lod.level !== 'global';
  const localView = lod.level === 'local';

  const inScope = useMemo(
    () => (regionId: string | null) => !activeRegion || regionId === activeRegion,
    [activeRegion]
  );

  /** ground stations, HAPS, drones and LEO satellites are hidden */
  const visibleAssets = useMemo(
    () =>
      ASSETS.filter((a) => {
        if (
          a.kind === 'satellite' ||
          a.kind === 'ground' ||
          a.kind === 'haps' ||
          a.kind === 'drone'
        )
          return false;
        if (!detailed) return false;
        return inScope(regionIdOf(a));
      }),
    [detailed, inScope]
  );
  const visibleIds = useMemo(() => new Set(visibleAssets.map((a) => a.id)), [visibleAssets]);

  const visibleLinks = useMemo(
    () =>
      links.filter((l) => {
        const from = ASSET_BY_ID[l.segment.from];
        const to = ASSET_BY_ID[l.segment.to];
        if (!from || !to) return false;
        if (!visibleIds.has(from.id) || !visibleIds.has(to.id)) return false;
        // at global range only the primary space-to-ground path is drawn
        if (!detailed) return from.kind === 'satellite' && to.kind === 'ground';
        return true;
      }),
    [links, visibleIds, detailed]
  );

  const scopedRegions = useMemo(
    () => REGIONS.filter((r) => inScope(r.id)),
    [inScope]
  );

  const visibleWeather = useMemo(() => {
    if (!detailed) return [];
    const cells = profile.weather.length ? profile.weather : AMBIENT_CELLS;
    return cells.filter((c) => {
      if (!activeRegion) return true;
      const r = REGION_BY_ID[activeRegion];
      if (!r) return true;
      return Math.abs(c.lat - r.lat) < 25 && Math.abs(c.lon - r.lon) < 30;
    });
  }, [profile.weather, detailed, activeRegion]);

  const regionCounts = useMemo(
    () =>
      Object.fromEntries(
        REGIONS.map((r) => [
          r.id,
          {
            assets: ASSETS.filter((a) => a.region === r.name).length,
            ground: ASSETS.filter((a) => a.region === r.name && a.kind === 'ground').length,
          },
        ])
      ) as Record<string, { assets: number; ground: number }>,
    []
  );

  return (
    <>
      {/* uniform ambient lighting only — no day/night terminator, no shadows */}
      <ambientLight intensity={3.2} />

      

      <LodDriver onChange={setLod} />
      <LabelProjector tier={lod.level} />


      <Suspense fallback={null}>
        <Earth />
      </Suspense>

      {/* LEO constellation — 20 satellites propagated on their visual orbits */}
      <OrbitDriver live={live} />
      <ContactNetwork live={live} contacts={state.contacts} />

      {layers.orbits && SATELLITES.map((s) => <OrbitTrack key={`trk-${s.id}`} elId={s.id} />)}
      {SATELLITES.map((sat) => (
        <AssetNode
          key={sat.id}
          asset={sat}
          live={live}
          selected={selection?.type === 'asset' && selection.id === sat.id}
          onRoute={routeAssets.has(sat.id)}
          onSelect={select}
          showLabel={layers.labels}
          linking={windowSats.has(sat.id)}
        />
      ))}

      {/* Ground stations, relay drones and HAPS — stacked over each site */}
      {SURFACE_STACK.map((a) => (
        <AssetNode
          key={a.id}
          asset={a}
          live={live}
          selected={selection?.type === 'asset' && selection.id === a.id}
          onRoute={routeAssets.has(a.id)}
          onSelect={select}
          showLabel={layers.labels}
        />
      ))}

      <OrbitControls
        ref={controls}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        minDistance={1.32}
        maxDistance={5.2}
        autoRotate={!selection && !view && lod.level === 'global' && state.running}
        autoRotateSpeed={0.22}
      />
      <CameraRig
        focusIds={view ? null : focus}
        live={live}
        approach={approach}
        controls={controls}
        view={view}
        onArrive={() => {
          setView(null);
          onPresetDone();
        }}
      />
    </>
  );
}



export function GlobeScene({ state }: { state: OloLinkState }) {
  const [lod, setLod] = useState<LodState>({ level: 'global', region: null });
  const onLod = useMemo(() => (s: LodState) => setLod(s), []);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [presetSeq] = useState(0);


  return (
    <LabelLayer tier={lod.level}>
      <Canvas
        /* framed over the Pacific so both Thailand and the United States are in view */
        camera={{ position: [OPERATIONAL_VIEW.position.x, OPERATIONAL_VIEW.position.y, OPERATIONAL_VIEW.position.z], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onPointerMissed={() => state.select(null)}
        className="!absolute inset-0"
      >
        <color attach="background" args={['#000000']} />
        <LodContext.Provider value={lod}>
          <SceneContent
            state={state}
            onLod={onLod}
            preset={preset}
            presetSeq={presetSeq}
            onPresetDone={() => setPreset(null)}
          />
        </LodContext.Provider>
      </Canvas>



    </LabelLayer>
  );
}


export { routeSegments };
export type { ScenarioProfile };
