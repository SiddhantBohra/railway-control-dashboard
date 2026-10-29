'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Clock3,
  GitCommitHorizontal,
  Minus,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import { OperationResultSchema } from '@control/contracts';
import type { Operation } from '@control/contracts';
import { http, errorMessage } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Message } from '@/components/ui/message';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Status } from '@/components/ui/status';

function Elapsed({ operation }: { operation: Operation }) {
  const [now, setNow] = useState<number | null>(null);
  const active = !operation.completedAt && operation.state !== 'review_required';
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const end = operation.completedAt ? Date.parse(operation.completedAt) : now;
  const seconds =
    end === null ? null : Math.max(0, Math.floor((end - Date.parse(operation.acceptedAt)) / 1000));
  const duration =
    seconds === null
      ? 'Just requested'
      : seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return (
    <span className="operation-duration">
      <Clock3 aria-hidden="true" />
      {operation.state === 'review_required' ? 'Awaiting review' : duration}
      {operation.completedAt ? ' total' : seconds !== null && active ? ' elapsed' : ''}
    </span>
  );
}

export function OperationPlaceholder() {
  return (
    <Card className="operation-placeholder">
      <div className="section-kicker">
        <GitCommitHorizontal aria-hidden="true" /> REQUEST TIMELINE
      </div>
      <div className="placeholder-orbit" aria-hidden="true">
        <GitCommitHorizontal />
      </div>
      <h2>Ready when you are</h2>
      <p>Follow your next request from acceptance to a confirmed result.</p>
      <div className="placeholder-stages" aria-hidden="true">
        <span /> <i /> <span /> <i /> <span />
      </div>
      <span className="subtle">Every change leaves a trail.</span>
    </Card>
  );
}

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
  const succeeded = operation.state === 'succeeded';
  const failed = operation.state === 'failed';
  const review = operation.state === 'review_required';
  const terminal = succeeded || failed;
  const alreadySatisfied = succeeded && operation.outcome === 'already_satisfied';
  const stage =
    operation.state === 'queued' ? 0 : operation.state === 'dispatching' ? 1 : terminal ? 3 : 2;
  // This is workflow-stage progress, never an estimate of provider deployment completion.
  // A failed request does not imply that all preceding stages succeeded.
  const progress = succeeded ? 100 : failed ? 25 : stage < 2 ? 25 : 50;
  const steps = [
    { label: 'Request accepted', detail: 'Saved durably to the database' },
    {
      label: alreadySatisfied ? 'Action not needed' : 'Processing',
      detail: alreadySatisfied
        ? 'Already in the requested state'
        : operation.state === 'queued'
          ? 'Waiting for the worker'
          : 'Coordinating with Railway',
    },
    {
      label: 'Provider confirmation',
      detail: review
        ? 'An operator needs to review the outcome'
        : failed
          ? 'Successful outcome not confirmed'
          : 'Checking the observed workload state',
    },
    {
      label: failed ? 'Request failed' : 'Result confirmed',
      detail: failed
        ? 'See the details below'
        : succeeded
          ? 'The requested state was observed'
          : 'Waiting for provider evidence',
    },
  ];
  return (
    <Card
      role="region"
      className={`operation-panel ${failed ? 'operation-failed' : review ? 'operation-review' : succeeded ? 'operation-complete' : ''}`}
      aria-labelledby="operation-heading"
    >
      <div className="section-kicker">
        <GitCommitHorizontal aria-hidden="true" /> LATEST REQUEST
      </div>
      <div className="section-heading operation-title">
        <h2 id="operation-heading">
          {operation.action === 'start' ? 'Start workload' : 'Stop deployment'}
        </h2>
        <Elapsed operation={operation} />
      </div>
      <div className="operation-status-row">
        <div aria-live="polite">
          <Status state={operation.state} />
        </div>
        <span className="subtle">
          {failed
            ? 'Ended unsuccessfully'
            : review
              ? 'Confirmation paused'
              : succeeded
                ? '4 of 4 stages'
                : `Step ${stage + 1} of 4`}
        </span>
      </div>
      <Progress
        value={progress}
        aria-label="Request workflow progress"
        aria-valuetext={
          failed
            ? 'Request failed; successful outcome not confirmed'
            : review
              ? 'Needs review; provider outcome unconfirmed'
              : succeeded
                ? 'Requested state confirmed'
                : `Step ${stage + 1} of 4; provider outcome not yet confirmed`
        }
        className={!terminal && !review ? 'progress-active' : ''}
      />
      <ol className="progress-track" aria-label="Operation progress">
        {steps.map(({ label, detail }, index) => {
          const skipped = alreadySatisfied && index === 1;
          const done = !skipped && (index === 0 || succeeded || (!failed && index < stage));
          const current = !terminal && index === Math.max(1, stage);
          const issue = (review && index === 2) || (failed && index === 3);
          return (
            <li
              key={index}
              data-step-state={
                issue
                  ? 'issue'
                  : skipped
                    ? 'skipped'
                    : done
                      ? 'done'
                      : current
                        ? 'active'
                        : 'waiting'
              }
              aria-current={current ? 'step' : undefined}
            >
              <span className="step-dot" aria-hidden="true">
                {issue ? (
                  review ? (
                    <TriangleAlert />
                  ) : (
                    <X />
                  )
                ) : skipped ? (
                  <Minus />
                ) : done ? (
                  <Check />
                ) : current ? (
                  <Spinner />
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              <div>
                <span className="step-title">{label}</span>
                <span className="step-description">{detail}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {operation.failure && (
        <Message tone={review ? 'warning' : failed ? 'error' : 'neutral'}>
          <strong>{operation.failure.code.replaceAll('_', ' ').toLowerCase()}</strong>
          <p>{operation.failure.message}</p>
        </Message>
      )}
      {succeeded && (
        <p className="operation-note">
          {alreadySatisfied
            ? 'The workload was already in the requested state. No mutation was sent.'
            : 'The requested state was observed. Future provider changes are shown separately.'}
        </p>
      )}
      {!terminal && !review && (
        <p className="operation-note">
          The request is saved. You can refresh or close this tab while the API checks Railway.
        </p>
      )}
      {review && (
        <div className="review-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={reconcile.isPending}
            aria-busy={reconcile.isPending}
            onClick={() => reconcile.mutate()}
          >
            {reconcile.isPending ? <Spinner /> : <RefreshCw aria-hidden="true" />}
            {reconcile.isPending ? 'Scheduling…' : 'Recheck provider state'}
          </Button>
          <span className="subtle">Read-only. The mutation will not be repeated.</span>
        </div>
      )}
      {reconcile.isError && <Message tone="error">{errorMessage(reconcile.error)}</Message>}
      <div className="operation-reference">
        <span>REQUEST ID</span>
        <code title={operation.id}>
          {operation.id.slice(0, 8)}
          <span aria-hidden="true">…</span>
        </code>
      </div>
    </Card>
  );
}
