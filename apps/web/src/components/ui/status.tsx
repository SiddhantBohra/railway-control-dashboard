import type { ObservedState, OperationState } from '@control/contracts';

const labels: Record<ObservedState | OperationState, string> = {
  running: 'Running',
  stopped: 'Stopped',
  transitioning: 'Transitioning',
  sleeping: 'Sleeping',
  failed: 'Failed',
  unknown: 'Unknown',
  queued: 'Queued',
  dispatching: 'Sending request',
  reconciling: 'Confirming state',
  succeeded: 'Completed',
  review_required: 'Needs review',
};
export function statusLabel(state: ObservedState | OperationState) {
  return labels[state];
}
export function Status({
  state,
  stale = false,
}: {
  state: ObservedState | OperationState;
  stale?: boolean;
}) {
  const tone = stale
    ? 'neutral'
    : ['running', 'succeeded'].includes(state)
      ? 'green'
      : ['failed', 'review_required'].includes(state)
        ? 'amber'
        : ['queued', 'dispatching', 'reconciling', 'transitioning'].includes(state)
          ? 'blue'
          : 'neutral';
  return (
    <span className={`status status-${tone}`}>
      <span aria-hidden="true" className="status-dot" />
      {stale ? `Last seen ${labels[state].toLowerCase()}` : labels[state]}
    </span>
  );
}
