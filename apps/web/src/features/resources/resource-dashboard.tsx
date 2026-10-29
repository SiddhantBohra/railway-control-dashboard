'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Box,
  Clock3,
  Cloud,
  FlaskConical,
  LogOut,
  Play,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { SessionSchema } from '@control/contracts';
import type { Action, Resource, Session } from '@control/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Message } from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import { Status } from '@/components/ui/status';
import {
  ActivitySkeleton,
  DashboardSkeleton,
  OperationSkeleton,
} from '@/components/loading-states';
import { http, HttpError, errorMessage } from '@/lib/http';
import { ActivityHistory } from '@/features/operations/activity-history';
import { OperationPlaceholder, OperationProgress } from '@/features/operations/operation-progress';
import { pending, useCommand, useHistory, useOperation, useResources } from './resource-queries';
import { clearPending, rememberRequest, usePendingRequest } from './pending-request';
import { StopDialog } from './stop-dialog';

function subscribeConnectivity(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function ResourceControl({ resource, session }: { resource: Resource; session: Session }) {
  const client = useQueryClient();
  const history = useHistory(resource.id);
  const latest = history.data?.pages[0]?.operations[0];
  const operationQuery = useOperation(latest);
  const current =
    operationQuery.data && (!latest || operationQuery.data.revision >= latest.revision)
      ? operationQuery.data
      : latest;
  const operations =
    history.data?.pages
      .flatMap((page) => page.operations)
      .map((operation) => (current?.id === operation.id ? current : operation)) ?? [];
  const command = useCommand(resource.id, session.csrfToken);
  const retryRequest = usePendingRequest();
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (!current || pending(current) || refreshed.current === current.id) return;
    refreshed.current = current.id;
    void client.invalidateQueries({ queryKey: ['resources'] });
    void client.invalidateQueries({ queryKey: ['history', resource.id] });
  }, [current, client, resource.id]);

  const requestAction = (action: Action) => {
    const request = rememberRequest(resource.id, action);
    command.mutate(
      { action: request.action, key: request.key },
      {
        onSuccess: () => clearPending(),
        onError: (error) => {
          if (
            error instanceof HttpError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 429
          )
            clearPending();
        },
      },
    );
  };
  const busy =
    pending(current) ||
    command.isPending ||
    !!retryRequest ||
    history.isPending ||
    history.isError ||
    !online;
  const canStart =
    !busy &&
    (resource.observedState === 'stopped' || resource.observedState === 'failed') &&
    !resource.stale;
  const canStop = !busy && resource.observedState === 'running' && !resource.stale;

  return (
    <>
      {!online && (
        <Message tone="warning">
          You are offline. The API continues processing accepted requests. Status will refresh when
          you reconnect.
        </Message>
      )}
      <div className="control-grid">
        <Card role="region" className="resource-panel" aria-labelledby="resource-heading">
          <div className="resource-overline">
            <span className="section-kicker">
              <Box aria-hidden="true" /> MANAGED WORKLOAD
            </span>
            <Status state={resource.observedState} stale={resource.stale} />
          </div>
          <div className="resource-top">
            <div className="resource-identity">
              <div className="resource-mark" aria-hidden="true">
                <Box />
              </div>
              <div>
                <div className="resource-title-line">
                  <h2 id="resource-heading">{resource.name}</h2>
                  <Badge variant="secondary" className="resource-type">
                    Container
                  </Badge>
                </div>
                <p className="subtle">
                  One managed service <span aria-hidden="true">·</span> one replica
                </p>
              </div>
            </div>
          </div>
          <div className="resource-state-grid">
            <div>
              <span className="field-label">
                <Target aria-hidden="true" /> INTENDED STATE
              </span>
              <strong>
                {resource.intendedState
                  ? resource.intendedState[0]?.toUpperCase() + resource.intendedState.slice(1)
                  : 'No request yet'}
              </strong>
            </div>
            <div>
              <span className="field-label">
                <Clock3 aria-hidden="true" /> LAST OBSERVATION
              </span>
              <strong>
                {resource.observedAt
                  ? new Date(resource.observedAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Awaiting first check'}
              </strong>
            </div>
            <div>
              <span className="field-label">
                <Activity aria-hidden="true" /> PROVIDER STATUS
              </span>
              <code>
                {resource.providerStatus ??
                  (resource.observedAt && resource.observedState === 'stopped'
                    ? 'No active deployment'
                    : 'Not yet confirmed')}
              </code>
            </div>
          </div>
          {resource.stale && (
            <Message tone="warning">
              {resource.observationError?.message ??
                'Provider information is stale. Controls will become available after the API confirms the current state.'}
            </Message>
          )}
          <div className="resource-actions">
            <div className="flex flex-wrap gap-3">
              <Button disabled={!canStart} onClick={() => requestAction('start')}>
                {command.isPending && command.variables?.action === 'start' ? (
                  <Spinner />
                ) : (
                  <Play aria-hidden="true" className="fill-current" />
                )}{' '}
                Start workload
              </Button>
              <StopDialog disabled={!canStop} onConfirm={() => requestAction('stop')} />
            </div>
          </div>
          <div className="deployment-detail">
            <div>
              <span className="field-label">DEPLOYMENT REFERENCE</span>
              <code title={resource.deploymentId ?? undefined}>
                {resource.deploymentId ?? 'Awaiting provider evidence'}
              </code>
            </div>
            <span className="deployment-detail-note">
              {resource.stale ? 'Last known evidence' : 'Provider-reported'}
            </span>
          </div>
          <div className="resource-footnote">
            <ShieldCheck aria-hidden="true" />
            <p>Start creates a deployment. Stop removes it, preserving the service.</p>
          </div>
          {command.isPending && (
            <div className="request-saving" role="status">
              <Spinner />
              <div>
                <strong>Saving your request…</strong>
                <p>Waiting for the API to acknowledge your request.</p>
              </div>
            </div>
          )}
          {command.isError && (
            <Message tone="error">
              {errorMessage(command.error)}
              {command.error instanceof HttpError && command.error.requestId && (
                <small>Request reference: {command.error.requestId}</small>
              )}
            </Message>
          )}
          {retryRequest?.resourceId === resource.id && !command.isPending && (
            <Message tone="warning">
              <p>
                A {retryRequest.action} request was interrupted. Retrying uses its original
                idempotency key and cannot create a second local operation.
              </p>
              <Button
                variant="outline"
                disabled={!online}
                onClick={() => requestAction(retryRequest.action)}
              >
                Recover request
              </Button>
            </Message>
          )}
        </Card>
        {history.isPending ? (
          <OperationSkeleton />
        ) : current ? (
          <OperationProgress operation={current} csrfToken={session.csrfToken} />
        ) : history.isError ? (
          <Card className="operation-placeholder">
            <Activity aria-hidden="true" />
            <h2>Timeline unavailable</h2>
            <p>Retry activity to load the latest request.</p>
          </Card>
        ) : (
          <OperationPlaceholder />
        )}
      </div>
      {history.isError && (
        <Message tone="error">
          {errorMessage(history.error)}{' '}
          <Button
            variant="ghost"
            onClick={() => {
              void history.refetch();
            }}
          >
            Retry activity
          </Button>
        </Message>
      )}
      {operationQuery.isError && (
        <Message tone="warning">
          The latest operation could not be refreshed. Its last known state remains visible.
        </Message>
      )}
      {history.isPending ? (
        <ActivitySkeleton />
      ) : history.isError && !history.data ? null : (
        <ActivityHistory
          operations={operations}
          hasMore={history.hasNextPage}
          loadingMore={history.isFetchingNextPage}
          onLoadMore={() => {
            void history.fetchNextPage();
          }}
        />
      )}
    </>
  );
}

export function ResourceDashboard({ session }: { session: Session }) {
  const resources = useResources();
  const client = useQueryClient();
  const logout = useMutation({
    mutationFn: () =>
      http('/auth/logout', SessionSchema, {
        method: 'POST',
        body: {},
        csrfToken: session.csrfToken,
      }),
    onSuccess: async (result) => {
      await client.cancelQueries();
      client.setQueryData(['session'], result);
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    },
  });
  const refresh = () => {
    void Promise.all([
      client.invalidateQueries({ queryKey: ['resources'] }),
      client.invalidateQueries({ queryKey: ['history'] }),
      client.invalidateQueries({ queryKey: ['operation'] }),
      client.invalidateQueries({ queryKey: ['session'] }),
    ]);
  };
  const resource = resources.data?.resources[0];
  return (
    <div className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">WORKSPACE / OVERVIEW</div>
          <h1>Workload control</h1>
          <p className="text-muted">Your infrastructure. A clear view of every change.</p>
        </div>
        <div className="dashboard-tools">
          <Button
            variant="outline"
            disabled={resources.isFetching}
            aria-busy={resources.isFetching}
            onClick={refresh}
          >
            {resources.isFetching ? <Spinner /> : <RefreshCw aria-hidden="true" />} Refresh
          </Button>
          <Button
            variant="ghost"
            disabled={logout.isPending}
            aria-busy={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? <Spinner /> : <LogOut aria-hidden="true" />} Sign out
          </Button>
        </div>
      </div>
      {resource?.mode === 'mock' && (
        <div className="mode-banner" role="status">
          <FlaskConical aria-hidden="true" className="mode-icon" />
          <Badge variant="outline" className="mode-label">
            LOCAL SIMULATOR
          </Badge>
          <p>
            Provider behavior is mocked. Requests and history are persisted in PostgreSQL; no
            Railway containers are controlled.
          </p>
        </div>
      )}
      {resource?.mode === 'railway' && (
        <div className="mode-banner">
          <Cloud aria-hidden="true" className="mode-icon" />
          <Badge variant="outline" className="mode-label mode-live">
            RAILWAY MODE
          </Badge>
          <p>
            Actions control the configured Railway workload. Observations reflect provider reports,
            not guaranteed application reachability.
          </p>
        </div>
      )}
      {logout.isError && <Message tone="error">{errorMessage(logout.error)}</Message>}
      {resources.isPending && <DashboardSkeleton label="Fetching your managed workload…" />}
      {resources.isError && (
        <Message tone="error">
          {errorMessage(resources.error)}{' '}
          <Button variant="ghost" onClick={refresh}>
            Check again
          </Button>
        </Message>
      )}
      {resource && <ResourceControl resource={resource} session={session} />}
      {resources.isSuccess && !resource && (
        <div className="panel empty-state">
          <h2>No managed workload</h2>
          <p>
            Register the configured demo workload with the API seed command. Only the operator can
            change its provider mapping.
          </p>
        </div>
      )}
      <footer className="dashboard-footer">
        <span>Intent ≠ observation. Acceptance ≠ completion.</span>
        <a href="/api/docs" target="_blank" rel="noreferrer">
          API reference <ArrowUpRight aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
