'use client';

import type { OloLinkState } from '@/hooks/use-ololink';
import { formatT } from '@/hooks/use-ololink';
import type { WorkspaceId } from '@/components/ololink/workspace-tabs';
import { WORKSPACE_TABS } from '@/components/ololink/workspace-tabs';

/**
 * Workspace context strip (LEVEL 1.5).
 *
 * Top tabs change the operational framing of the whole environment; this compact
 * readout is the workspace-level summary. It intentionally holds no tools,
 * modules or asset lists — those live in the left sidebar.
 */

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-[8px] uppercase tracking-[0.24em] text-muted-foreground/50">
        {label}
      </span>
      <span
        className={
          accent
            ? 'font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200'
            : 'font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/85'
        }
      >
        {value}
      </span>
    </div>
  );
}

function rows(workspace: WorkspaceId, state: OloLinkState): { label: string; value: string; accent?: boolean }[] {
  const { profile, telemetry } = state;
  const active = state.links.filter((l) => l.status === 'ACTIVE').length;
  const degraded = state.links.filter((l) => l.status !== 'ACTIVE').length;

  if (workspace === 'dashboard') {
    return [
      { label: 'Mission clock', value: formatT(state.missionTime) },
      { label: 'Posture', value: profile.networkHealth, accent: true },
      { label: 'Availability', value: `${telemetry.availability.toFixed(2)}%` },
      { label: 'Open alerts', value: String(profile.alerts.length) },
    ];
  }
  if (workspace === 'command') {
    return [
      { label: 'Authority', value: state.running ? 'Live orchestration' : 'Operator hold', accent: true },
      { label: 'Primary route', value: `${state.route.length} hops` },
      { label: 'Links active', value: `${active} of ${state.links.length}` },
      { label: 'Reroutes', value: String(state.rerouteSeq) },
    ];
  }
  if (workspace === 'intelligence') {
    return [
      { label: 'Atmosphere', value: profile.short, accent: true },
      { label: 'Severity', value: `${profile.severity}` },
      { label: 'AI state', value: state.aiProcessing ? 'Recalculating' : profile.systemMode },
      { label: 'Degraded links', value: String(degraded) },
    ];
  }
  return [
    { label: 'Latency', value: `${telemetry.latency} ms`, accent: true },
    { label: 'Bandwidth', value: `${telemetry.bandwidth.toFixed(2)} Gbps` },
    { label: 'Availability', value: `${telemetry.availability.toFixed(2)}%` },
    { label: 'Events logged', value: String(state.events.length) },
  ];
}

export function WorkspaceContext({
  workspace,
  state,
}: {
  workspace: WorkspaceId;
  state: OloLinkState;
}) {
  const meta = WORKSPACE_TABS.find((t) => t.id === workspace)!;

  return (
    <section className="pointer-events-none absolute right-4 top-[92px] z-20 w-[196px] rounded-2xl border border-white/25 bg-[#050505] px-3 py-2.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.85)]">
      <header className="mb-2 border-b border-white/[0.06] pb-2">
        <h2 className="font-mono text-[9px] uppercase tracking-[0.26em] text-sky-200/90">
          {meta.label}
        </h2>
        <p className="mt-0.5 text-[9px] tracking-wide text-muted-foreground/55">{meta.hint}</p>
      </header>
      <div className="flex flex-col gap-1.5">
        {rows(workspace, state).map((r) => (
          <Row key={r.label} {...r} />
        ))}
      </div>
    </section>
  );
}
