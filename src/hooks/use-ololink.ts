'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASSET_BY_ID,
  SCENARIOS,
  linkStates,
  routeSegments,
  type Segment,
  type Tech,
  type LinkState,
  type ScenarioId,
  type ScenarioProfile,
} from '@/lib/ololink';
import { solveContacts } from '@/lib/contacts';
import { advanceChains, initialChains, type ChainTelemetry } from '@/lib/chain';
import { resetSceneTime, sceneTime, setSceneRunning } from '@/lib/geo2d';

export type RailId =
  | 'overview'
  | 'assets'
  | 'network'
  | 'intel'
  | 'analytics'
  | 'alerts'
  | 'settings'
  | 'context'
  | 'leo'
  | 'haps'
  | 'drone'
  | 'ground'
  | 'search'
  | 'view';

export type ViewMode = '3d' | '2d';

export interface Selection {
  type: 'asset' | 'link';
  id: string;
}

export interface Telemetry {
  bandwidth: number;
  latency: number;
  packetLoss: number;
  signal: number;
  availability: number;
}

export interface EventEntry {
  id: string;
  time: string;
  level: 'INFO' | 'OK' | 'WARN' | 'ALERT';
  text: string;
}

export function formatT(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function jitter(base: number, pct: number, digits = 2) {
  const d = (base * pct) / 100;
  return +(base + (Math.random() * 2 - 1) * d).toFixed(digits);
}

export interface OloLinkState {
  scenarioId: ScenarioId;
  profile: ScenarioProfile;
  telemetry: Telemetry;
  links: LinkState[];
  /** ordered segments of the AI-selected primary route */
  route: Segment[];
  /** route that was just replaced by the AI (fades out in the scene) */
  previousRoute: Segment[] | null;
  rerouteSeq: number;
  /** segment ids currently animating through an adaptive reroute */
  reroutingIds: Set<string>;
  missionTime: number;
  events: EventEntry[];
  panel: RailId | null;
  selection: Selection | null;
  aiProcessing: boolean;
  running: boolean;
  layers: { weather: boolean; orbits: boolean; labels: boolean; routes: boolean };
  /** spatial environment view mode — same mission state, different projection */
  view: ViewMode;
  setView: (v: ViewMode) => void;
  techFilter: Record<Tech, boolean>;
  /** receiverId -> satellite id currently inside a simulated communication window */
  windows: Record<string, string | null>;
  /** open satellite contacts as `${satId}|${receiverId}` — shared by both views */
  contacts: string[];
  /** live LEO→HAPS→Drone→Ground chain telemetry, keyed by site number */
  chains: Record<string, ChainTelemetry>;
  reportWindow: (receiverId: string, satId: string | null) => void;
  toggleTech: (t: Tech) => void;
  setScenario: (id: ScenarioId) => void;
  setPanel: (id: RailId | null) => void;
  togglePanel: (id: RailId) => void;
  select: (s: Selection | null) => void;
  toggleLayer: (k: keyof OloLinkState['layers']) => void;
  setRunning: (v: boolean) => void;
  approve: () => void;
  /** reset every comm/link signal: scenario, windows, routes, telemetry, clock */
  reset: () => void;
}


export function useOloLink(): OloLinkState {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('clear');
  const [missionTime, setMissionTime] = useState(0);
  const [panel, setPanel] = useState<RailId | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [running, setRunning] = useState(true);
  const [previousRoute, setPreviousRoute] = useState<Segment[] | null>(null);
  const [rerouteSeq, setRerouteSeq] = useState(0);
  const [reroutingIds, setReroutingIds] = useState<Set<string>>(new Set());
  const [layers, setLayers] = useState({ weather: true, orbits: true, labels: true, routes: true });
  const [view, setViewState] = useState<ViewMode>('3d');
  const [techFilter, setTechFilter] = useState<Record<Tech, boolean>>({
    OPTICAL: true,
    FSO: true,
    MICROWAVE: true,
    RF: true,
    FIBER: true,
  });
  const [telemetry, setTelemetry] = useState<Telemetry>(SCENARIOS.clear.telemetry);
  const [windows, setWindows] = useState<Record<string, string | null>>({});
  const [contacts, setContacts] = useState<string[]>([]);
  const [chains, setChains] = useState<Record<string, ChainTelemetry>>(() => initialChains('clear'));
  const [events, setEvents] = useState<EventEntry[]>([
    { id: 'e0', time: 'T+00:00', level: 'INFO', text: 'Orchestration session initialised' },
    { id: 'e1', time: 'T+00:02', level: 'OK', text: 'Constellation handshake complete' },
  ]);
  const counter = useRef(0);
  const clock = useRef(0);

  const profile = SCENARIOS[scenarioId];


  const push = useCallback((level: EventEntry['level'], text: string) => {
    setEvents((prev) => {
      counter.current += 1;
      const id = `e-${counter.current}-${Math.random().toString(36).slice(2, 8)}`;
      return [...prev.slice(-60), { id, time: formatT(clock.current), level, text }];
    });
  }, []);

  const reportWindow = useCallback(
    (receiverId: string, satId: string | null) => {
      setWindows((prev) => {
        const current = prev[receiverId] ?? null;
        if (current === satId) return prev;
        const rx = ASSET_BY_ID[receiverId]?.name ?? receiverId;
        if (satId && current) {
          push('OK', `Handover ${ASSET_BY_ID[current]?.name ?? current} → ${ASSET_BY_ID[satId]?.name ?? satId} at ${rx}`);
        } else if (satId) {
          push('OK', `Comm window acquired: ${ASSET_BY_ID[satId]?.name ?? satId} → ${rx}`);
        } else if (current) {
          push('INFO', `Comm window closed: ${ASSET_BY_ID[current]?.name ?? current} → ${rx}`);
        }
        return { ...prev, [receiverId]: satId };
      });
    },
    [push]
  );


  /* ------------------------------------------------------------------
   * Single source of truth for the orbital simulation.
   * Contacts/windows are solved here (never inside a view), so the 3D globe
   * and the 2D map always project the exact same live state.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    setSceneRunning(running);
  }, [running]);

  const held = useRef<Set<string>>(new Set());
  const windowsRef = useRef<Record<string, string | null>>({});
  windowsRef.current = windows;

  useEffect(() => {
    if (!running) return;
    const step = () => {
      const { pairs, windows: next } = solveContacts(sceneTime(), held.current);
      const prev = held.current;
      if (pairs.length !== prev.size || pairs.some((k) => !prev.has(k))) {
        held.current = new Set(pairs);
        setContacts(pairs);
      }
      for (const [rxId, satId] of Object.entries(next)) {
        if ((windowsRef.current[rxId] ?? null) !== satId) reportWindow(rxId, satId);
      }
    };
    step();
    const t = setInterval(step, 300);
    return () => clearInterval(t);
  }, [running, reportWindow]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      clock.current += 1;
      setMissionTime(clock.current);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);


  useEffect(() => {
    if (!running) return;
    const base = SCENARIOS[scenarioId].telemetry;
    const t = setInterval(() => {
      setTelemetry({
        bandwidth: Math.max(0.2, jitter(base.bandwidth, 4)),
        latency: Math.round(jitter(base.latency, 6, 0)),
        packetLoss: Math.max(0, jitter(base.packetLoss, 14)),
        signal: Math.round(jitter(base.signal, 3, 0)),
        availability: Math.min(99.99, +jitter(base.availability, 0.3).toFixed(2)),
      });
    }, 1600);
    return () => clearInterval(t);
  }, [scenarioId, running]);

  useEffect(() => {
    if (!running) return;
    const ambient: Record<ScenarioId, [EventEntry['level'], string][]> = {
      clear: [['OK', 'Optical margin nominal'], ['INFO', 'Constellation telemetry synced']],
      cloud: [['INFO', 'Cloud deck tracking update'], ['OK', 'HAPS relay stable']],
      rain: [['WARN', 'Rain attenuation increasing'], ['OK', 'Microwave relay holding']],
      storm: [['ALERT', 'Storm cell expansion detected'], ['WARN', 'Route recalculation cycle']],
    };
    const t = setInterval(() => {
      const pool = ambient[scenarioId];
      const pick = pool[Math.floor(Math.random() * pool.length)]!;
      push(pick[0], pick[1]);
    }, 8000);
    return () => clearInterval(t);
  }, [scenarioId, running, push]);

  const setScenario = useCallback(
    (id: ScenarioId) => {
      if (id === scenarioId) return;
      setAiProcessing(true);
      push('INFO', `Weather state change → ${SCENARIOS[id].name}`);
      const outgoing = routeSegments(SCENARIOS[scenarioId].route, SCENARIOS[scenarioId].routeSegmentIds);
      const incoming = routeSegments(SCENARIOS[id].route, SCENARIOS[id].routeSegmentIds);
      setReroutingIds(new Set([...outgoing, ...incoming].map((s) => s.id)));
      setTimeout(() => {
        setPreviousRoute(outgoing);
        setRerouteSeq((n) => n + 1);
        setScenarioId(id);
        setAiProcessing(false);
        setTimeout(() => setReroutingIds(new Set()), 2600);
        push(
          SCENARIOS[id].severity > 60 ? 'ALERT' : 'OK',
          `AI decision: ${SCENARIOS[id].ai.action.toLowerCase()}`
        );
      }, 900);
    },
    [scenarioId, push]
  );

  const reset = useCallback(() => {
    clock.current = 0;
    counter.current = 0;
    setMissionTime(0);
    setScenarioId('clear');
    setSelection(null);
    setAiProcessing(false);
    setPreviousRoute(null);
    setReroutingIds(new Set());
    setTelemetry(SCENARIOS.clear.telemetry);
    setWindows({});
    setContacts([]);
    setChains(initialChains('clear'));
    held.current = new Set();
    resetSceneTime();
    setRunning(true);
    setEvents([
      { id: 'e0', time: 'T+00:00', level: 'INFO', text: 'Orchestration session reset' },
      { id: 'e1', time: 'T+00:00', level: 'OK', text: 'All laser/comm links re-initialised' },
    ]);
  }, []);

  /* Chain telemetry (LEO -> HAPS -> Drone -> Ground) advances from the same
   * shared mission state, so 2D and 3D Inspectors always agree. */
  const chainCtx = useRef({ scenarioId, bandwidth: telemetry.bandwidth, windows });
  chainCtx.current = { scenarioId, bandwidth: telemetry.bandwidth, windows };

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const c = chainCtx.current;
      setChains((prev) =>
        advanceChains(prev, 1, {
          scenario: c.scenarioId,
          baseBandwidth: c.bandwidth,
          windows: c.windows,
        })
      );
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const links = useMemo(() => linkStates(profile, reroutingIds), [profile, reroutingIds]);
  const route = useMemo(() => routeSegments(profile.route, profile.routeSegmentIds), [profile]);

  // clear the ghost of the replaced route once it has finished fading
  useEffect(() => {
    if (!previousRoute) return;
    const t = setTimeout(() => setPreviousRoute(null), 3200);
    return () => clearTimeout(t);
  }, [previousRoute, rerouteSeq]);

  return {
    scenarioId,
    profile,
    telemetry,
    links,
    route,
    previousRoute,
    rerouteSeq,
    reroutingIds,
    missionTime,
    events,
    panel,
    selection,
    aiProcessing,
    running,
    layers,
    techFilter,
    windows,
    contacts,
    chains,
    reportWindow,
    toggleTech: (t) => setTechFilter((f) => ({ ...f, [t]: !f[t] })),
    setScenario,
    setPanel,
    togglePanel: (id) => setPanel((p) => (p === id ? null : id)),
    select: (s) => {
      setSelection(s);
      if (s) {
        push('INFO', `Inspector focus: ${s.type === 'asset' ? s.id : `link ${s.id}`}`);
      }
    },
    view,
    setView: (v) => setViewState(v),
    toggleLayer: (k) => setLayers((l) => ({ ...l, [k]: !l[k] })),
    setRunning,
    approve: () => push('OK', `Operator approved: ${profile.ai.action}`),
    reset,
  };
}
