import type { ObservedState, OperationState } from '@control/contracts';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { Badge } from './badge';
import { Spinner } from './spinner';

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
      : state === 'failed'
        ? 'red'
        : state === 'review_required'
          ? 'amber'
          : ['queued', 'dispatching', 'reconciling', 'transitioning'].includes(state)
            ? 'blue'
            : 'neutral';
  return (
    <Badge variant="outline" className={`status status-${tone}`}>
      {!stale && ['queued', 'dispatching', 'reconciling', 'transitioning'].includes(state) ? (
        <Spinner />
      ) : !stale && state === 'succeeded' ? (
        <CircleCheck aria-hidden="true" />
      ) : !stale && state === 'failed' ? (
        <CircleX aria-hidden="true" />
      ) : !stale && state === 'review_required' ? (
        <TriangleAlert aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className="status-dot" />
      )}
      {stale
        ? state === 'unknown'
          ? 'Awaiting observation'
          : `Last seen ${labels[state].toLowerCase()}`
        : labels[state]}
    </Badge>
  );
}
