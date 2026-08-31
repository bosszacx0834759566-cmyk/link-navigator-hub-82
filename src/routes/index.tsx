import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useOloLink } from '@/hooks/use-ololink';
import { SystemHeader } from '@/components/ololink/system-header';

import { SystemRail } from '@/components/ololink/system-rail';
import { SystemPanel } from '@/components/ololink/system-panel';
import { ObjectCard } from '@/components/ololink/object-card';

const MapScene = lazy(() =>
  import('@/components/ololink/map-scene').then((m) => ({ default: m.MapScene }))
);

const GlobeScene = lazy(() =>
  import('@/components/ololink/globe-scene').then((m) => ({ default: m.GlobeScene }))
);

export const Route = createFileRoute('/')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'OloLink Explorer — Spatial Network Operations' },
      {
        name: 'description',
        content:
          'OloLink Explorer: a spatial operating environment for intelligent communication orchestration across LEO satellites, HAPS, relay drones and ground stations.',
      },
      { property: 'og:title', content: 'OloLink Explorer — Spatial Network Operations' },
      {
        property: 'og:description',
        content:
          'Operate the global communication network from a live 3D Earth: adaptive routing, weather intelligence and AI decisions in one spatial environment.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Explorer,
});

function Explorer() {
  const state = useOloLink();
  const { setPanel, select } = state;

  // Esc closes any open panel / inspector
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanel(null);
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPanel, select]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-foreground">
      {/* LEVEL 1 — spatial environment */}
      <div
        className="absolute inset-0"
        onPointerDownCapture={() => {
          setPanel(null);
          select(null);
        }}
      >

        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <span className="animate-pulse font-mono text-[10px] uppercase tracking-[0.3em] text-sky-400/70">
                Initialising spatial environment
              </span>
            </div>
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            {state.view === '3d' ? (
              <motion.div
                key="view-3d"
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.06, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.06, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlobeScene state={state} />
              </motion.div>
            ) : (
              <motion.div
                key="view-2d"
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <MapScene state={state} />
              </motion.div>
            )}
          </AnimatePresence>
        </Suspense>
      </div>


      {/* LEVEL 2 — brand strip + system tab rail */}
      <SystemHeader />
      <SystemRail state={state} />

      {/* LEVEL 3 — slide-out data panel for the active tab */}
      <SystemPanel state={state} />

      {/* LEVEL 4 — inspector for the selected asset / link (shared by 2D and 3D) */}
      <ObjectCard state={state} />

    </div>
  );
}
