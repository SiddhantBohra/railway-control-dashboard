'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OperationResultSchema } from '@control/contracts';
import type { Operation } from '@control/contracts';
import { http, errorMessage } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Message } from '@/components/ui/message';
import { Status } from '@/components/ui/status';

export function OperationProgress({
  operation,
  csrfToken,
}: {
  operation: Operation;
  csrfToken: string;
}) {
  const client = useQueryClient();
  const reconcile = useMutation({
    mutationFn: () =>
      http(`/operations/${operation.id}/reconcile`, OperationResultSchema, {
        method: 'POST',
        body: {},
        csrfToken,
      }),
    onSuccess: async ({ operation: updated }) => {
      client.setQueryData(['operation', updated.id], updated);
      await client.invalidateQueries({ queryKey: ['history'] });
    },
  });
  const isComplete = ['succeeded', 'failed'].includes(operation.state);
  const step =
    operation.state === 'queued' ? 0 : operation.state === 'dispatching' ? 1 : isComplete ? 3 : 2;
  return (
    <section className="panel operation-panel" aria-labelledby="operation-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LATEST REQUEST</span>
          <h2 id="operation-heading">
            {operation.action === 'start' ? 'Start workload' : 'Stop deployment'}
          </h2>
        </div>
        <div aria-live="polite">
          <Status state={operation.state} />
        </div>
      </div>
      <ol className="progress-track" aria-label="Operation progress">
        {['Accepted', 'Processing', 'Confirming', 'Finished'].map((label, index) => (
          <li
            key={label}
            className={index <= step ? 'step-reached' : ''}
            aria-current={!isComplete && index === step ? 'step' : undefined}
          >
            <span className="step-dot" aria-hidden="true">
              {index < step || (isComplete && index === step) ? '✓' : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {operation.failure && (
        <Message
          tone={
            operation.state === 'review_required'
              ? 'warning'
              : operation.state === 'failed'
                ? 'error'
                : 'neutral'
          }
        >
          <strong>{operation.failure.code.replaceAll('_', ' ').toLowerCase()}</strong>
          <p>{operation.failure.message}</p>
        </Message>
      )}
      {operation.state === 'succeeded' && (
        <p className="subtle">
          {operation.outcome === 'already_satisfied'
            ? 'The workload was already in the requested state. No mutation was sent.'
            : 'The requested state was observed. Future provider changes are shown separately.'}
        </p>
      )}
      {!isComplete && operation.state !== 'review_required' && (
        <p className="subtle">
          The request is saved. You can refresh or close this tab while the API checks Railway.
        </p>
      )}
      {operation.state === 'review_required' && (
        <div className="review-actions">
          <Button
            variant="secondary"
            disabled={reconcile.isPending}
            onClick={() => reconcile.mutate()}
          >
            {reconcile.isPending ? 'Scheduling…' : 'Recheck provider state'}
          </Button>
          <span className="subtle">Read-only. The mutation will not be repeated.</span>
        </div>
      )}
      {reconcile.isError && <Message tone="error">{errorMessage(reconcile.error)}</Message>}
      <div className="operation-reference">
        <span>Operation</span>
        <code>{operation.id}</code>
      </div>
    </section>
  );
}
