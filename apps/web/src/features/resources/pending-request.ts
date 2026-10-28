'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { Action } from '@control/contracts';

const schema = z.strictObject({
  key: z.uuid(),
  action: z.enum(['start', 'stop']),
  resourceId: z.uuid(),
});
const storageKey = 'control.pending-request';
const changedEvent = 'control-pending-request-changed';
export type PendingRequest = z.infer<typeof schema>;

// This is retry metadata, not a credential or a competing cache of server state.
export function readPending(): PendingRequest | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    return raw ? schema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function rememberRequest(resourceId: string, action: Action): PendingRequest {
  const previous = readPending();
  if (previous?.resourceId === resourceId && previous.action === action) return previous;
  const request = { resourceId, action, key: crypto.randomUUID() };
  sessionStorage.setItem(storageKey, JSON.stringify(request));
  window.dispatchEvent(new Event(changedEvent));
  return request;
}
export function clearPending(): void {
  sessionStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(changedEvent));
}

function subscribe(listener: () => void) {
  window.addEventListener(changedEvent, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(changedEvent, listener);
    window.removeEventListener('storage', listener);
  };
}
function snapshot() {
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
export function usePendingRequest() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => {
    try {
      return raw ? schema.parse(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }, [raw]);
}
