import type { ObservedState, OperationState } from '@control/contracts';
import type { Deployment, RailwaySnapshot } from '../../../integrations/railway/railway.boundary';

export const UNRESOLVED_STATES: OperationState[] = [
  'queued',
  'dispatching',
  'reconciling',
  'review_required',
];
const transitioning = new Set([
  'BUILDING',
  'DEPLOYING',
  'INITIALIZING',
  'QUEUED',
  'REMOVING',
  'WAITING',
  'NEEDS_APPROVAL',
]);
const inactive = new Set(['REMOVED', 'FAILED', 'CRASHED', 'SKIPPED']);

export function isInactive(deployment: Deployment): boolean {
  return inactive.has(deployment.status);
}
export function isRunning(deployment: Deployment): boolean {
  return (
    deployment.status === 'SUCCESS' &&
    deployment.instances.some((instance) => instance.status === 'RUNNING')
  );
}
export function observedState(snapshot: RailwaySnapshot): ObservedState {
  if (!snapshot.complete) return 'unknown';
  const live = snapshot.deployments.filter((deployment) => !isInactive(deployment));
  if (live.length === 0) {
    const latest = [...snapshot.deployments].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )[0];
    return latest && ['FAILED', 'CRASHED'].includes(latest.status) ? 'failed' : 'stopped';
  }
  if (live.length !== 1) return 'unknown';
  const deployment = live[0];
  if (!deployment) return 'unknown';
  if (isRunning(deployment)) return 'running';
  if (deployment.status === 'SLEEPING') return 'sleeping';
  if (transitioning.has(deployment.status)) return 'transitioning';
  return 'unknown';
}
export function checkDelay(attempt: number, mode: 'mock' | 'railway'): number {
  return mode === 'mock' ? 1000 : Math.min(30000, 5000 * 2 ** Math.min(attempt, 3));
}
export function isTerminal(state: OperationState): boolean {
  return state === 'succeeded' || state === 'failed';
}
