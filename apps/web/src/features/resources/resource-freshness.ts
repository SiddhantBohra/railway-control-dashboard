'use client';

import { useEffect, useState } from 'react';
import { OBSERVATION_FRESHNESS_MS } from '@control/contracts';
import type { Resource } from '@control/contracts';

export function useObservationStale(resource: Resource, refreshFailed: boolean): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const observedAt = resource.observedAt ? Date.parse(resource.observedAt) : NaN;
  return (
    refreshFailed ||
    resource.stale ||
    !Number.isFinite(observedAt) ||
    now - observedAt >= OBSERVATION_FRESHNESS_MS
  );
}
