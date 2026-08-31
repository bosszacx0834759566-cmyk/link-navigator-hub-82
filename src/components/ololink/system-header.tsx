'use client';

import logoUrl from '@/assets/logo.png';

/** Slim brand strip. Scenario simulation tabs live in the left system rail. */
export function SystemHeader() {
  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-center px-4">
      <img src={logoUrl} alt="OloLink logo" className="h-8 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
    </header>
  );
}
