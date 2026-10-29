import { Inject, Injectable } from '@nestjs/common';
import type { Failure } from '@control/contracts';
import { Config } from '../../../config/config';
import { logger } from '../../../common/logging';
import { RailwayLifecycle, ProviderError } from '../../../integrations/railway/railway.boundary';
import type { RailwaySnapshot } from '../../../integrations/railway/railway.boundary';
import { ResourcesService } from '../../resources/services/resources.service';
import { ResourcesRepository } from '../../resources/repositories/resources.repository';
import type { ObservationTicket } from '../../resources/repositories/resources.repository';
import type { ResourceRecord } from '../../resources/models/resource.model';
import { OperationsRepository } from '../repositories/operations.repository';
import type { OperationRecord } from '../models/operation.model';
import {
  checkDelay,
  isInactive,
  isRunning,
  latestDeployment,
  observationDeployment,
  observedState,
} from '../domain/lifecycle';

function safeFailure(error: unknown): Failure {
  return error instanceof ProviderError
    ? { code: error.code, message: error.message }
    : {
        code: 'PROCESSING_ERROR',
        message: 'Processing was interrupted. The operation will be checked again.',
      };
}

@Injectable()
export class OperationProcessor {
  private nextIdleAt = 0;

  constructor(
    @Inject(OperationsRepository) private readonly operations: OperationsRepository,
    @Inject(ResourcesRepository) private readonly resources: ResourcesRepository,
    @Inject(ResourcesService) private readonly access: ResourcesService,
    @Inject(RailwayLifecycle) private readonly railway: RailwayLifecycle,
    @Inject(Config) private readonly config: Config,
  ) {}

  async tick(ownsLock: () => boolean): Promise<void> {
    if (!ownsLock()) return;
    const operation = await this.operations.due(new Date());
    if (operation) {
      await this.process(operation, ownsLock);
      return;
    }
    if (Date.now() < this.nextIdleAt) return;
    this.nextIdleAt = Date.now() + this.config.values.PROVIDER_IDLE_MS;
    const resources = await this.access.list(this.config.values.DEMO_USERNAME);
    for (const resource of resources) {
      const ticket = await this.resources.beginObservation(resource);
      if (!ticket) continue;
      try {
        await this.saveObservation(ticket, await this.railway.snapshot(resource));
      } catch (error) {
        await this.resources.observationFailed(ticket, safeFailure(error));
      }
    }
  }

  private async saveObservation(
    ticket: ObservationTicket,
    snapshot: RailwaySnapshot,
  ): Promise<void> {
    const current = observationDeployment(snapshot);
    const latest = latestDeployment(snapshot);
    const accepted = await this.resources.observe(ticket, {
      observedState: observedState(snapshot),
      providerStatus: current?.status ?? null,
      deploymentId: current?.id ?? null,
      observedAt: snapshot.observedAt,
      providerUpdatedAt: current ? new Date(current.updatedAt) : null,
      latestDeployment: latest
        ? {
            id: latest.id,
            status: latest.status,
            createdAt: latest.createdAt,
            updatedAt: latest.updatedAt,
          }
        : null,
    });
    if (!accepted) throw this.staleObservation();
  }

  private staleObservation(): ProviderError {
    return new ProviderError(
      'STALE_OBSERVATION',
      'Provider evidence was superseded or conflicted with a newer observation. Checking again before deciding the outcome.',
    );
  }

  async process(operation: OperationRecord, ownsLock: () => boolean): Promise<void> {
    let resource: ResourceRecord;
    try {
      resource = await this.access.requireOwned(operation.resourceId, operation.actorSubject);
    } catch {
      await this.finish(operation, operation.dispatchAt ? 'review_required' : 'failed', {
        code: 'RESOURCE_SCOPE_CHANGED',
        message: 'The configured resource mapping changed. Operator review is required.',
      });
      return;
    }
    if (operation.generation !== resource.generation) {
      await this.finish(operation, 'review_required', {
        code: 'GENERATION_CHANGED',
        message: 'A newer intent exists. This operation requires review.',
      });
      return;
    }
    const ticket = await this.resources.beginObservation(resource);
    if (!ticket || !ownsLock()) return;
    try {
      if (operation.state === 'queued') await this.dispatch(operation, resource, ticket, ownsLock);
      else await this.reconcile(operation, resource, ticket);
    } catch (error) {
      await this.resources.observationFailed(ticket, safeFailure(error));
      // A DB write may have succeeded before throwing. Always use revision/state CAS.
      await this.deferOrFinish(operation, error);
    }
  }

  private async dispatch(
    operation: OperationRecord,
    resource: ResourceRecord,
    ticket: ObservationTicket,
    ownsLock: () => boolean,
  ): Promise<void> {
    if (Date.now() >= operation.deadlineAt.getTime()) {
      await this.finish(operation, 'failed', {
        code: 'EXPIRED_BEFORE_DISPATCH',
        message: 'The request expired before any mutation was sent.',
      });
      return;
    }
    const snapshot = await this.railway.snapshot(resource);
    await this.saveObservation(ticket, snapshot);
    const state = observedState(snapshot);
    const live = snapshot.deployments.filter((deployment) => !isInactive(deployment));
    if (!snapshot.complete || state === 'unknown' || live.length > 1) {
      await this.finish(operation, 'review_required', {
        code: 'AMBIGUOUS_PROVIDER_STATE',
        message: 'Railway has incomplete or conflicting deployment state. No mutation was sent.',
      });
      return;
    }
    if (
      (operation.action === 'start' && state === 'running') ||
      (operation.action === 'stop' && state === 'stopped')
    ) {
      await this.finish(operation, 'succeeded', null, 'already_satisfied');
      return;
    }
    if (state === 'transitioning' || state === 'sleeping') {
      await this.finish(operation, 'failed', {
        code: 'PROVIDER_BUSY',
        message:
          'The workload is transitioning or sleeping. Resolve its Railway state, then request a new action.',
      });
      return;
    }
    const target = live[0]?.id ?? null;
    if (operation.action === 'stop' && !target) {
      await this.finish(operation, 'review_required', {
        code: 'TARGET_NOT_FOUND',
        message: 'A deployment to stop could not be established.',
      });
      return;
    }
    const dispatching = await this.operations.update(operation, {
      state: 'dispatching',
      dispatchAt: new Date(),
      targetDeploymentId: operation.action === 'stop' ? target : null,
      baselineDeploymentIds: snapshot.deployments.map((deployment) => deployment.id),
      failure: null,
    });
    if (!dispatching || !ownsLock()) return;
    logger.info(
      { operationId: operation.id, action: operation.action },
      'Dispatching Railway mutation',
    );
    try {
      let resultDeploymentId: string | null = null;
      if (operation.action === 'start') resultDeploymentId = await this.railway.start(resource);
      else if (target) await this.railway.remove(resource, target);
      if (!ownsLock()) return;
      await this.operations.update(dispatching, {
        state: 'reconciling',
        resultDeploymentId,
        nextCheckAt: new Date(Date.now() + checkDelay(0, resource.mode)),
      });
    } catch (error) {
      if (!ownsLock()) return;
      if (error instanceof ProviderError && error.certainty === 'rejected') {
        if (error.code === 'PROVIDER_RATE_LIMITED' && Date.now() < operation.deadlineAt.getTime()) {
          // A local budget rejection or explicit HTTP 429 is known not to have dispatched.
          await this.operations.update(dispatching, {
            state: 'queued',
            dispatchAt: null,
            failure: safeFailure(error),
            nextCheckAt: new Date(Date.now() + (error.retryAfterMs ?? 60000)),
          });
        } else await this.finish(dispatching, 'failed', safeFailure(error));
      } else {
        await this.operations.update(dispatching, {
          state: 'reconciling',
          failure: safeFailure(error),
          nextCheckAt: new Date(Date.now() + checkDelay(0, resource.mode)),
        });
      }
    }
  }

  private async reconcile(
    operation: OperationRecord,
    resource: ResourceRecord,
    ticket: ObservationTicket,
  ): Promise<void> {
    // This path deliberately contains no provider mutations, even after a process restart.
    const snapshot = await this.railway.snapshot(resource);
    await this.saveObservation(ticket, snapshot);
    if (!snapshot.complete) {
      await this.deferOrFinish(
        operation,
        new ProviderError(
          'INCOMPLETE_OBSERVATION',
          'Railway returned an incomplete deployment list.',
        ),
      );
      return;
    }
    const id =
      operation.action === 'start' ? operation.resultDeploymentId : operation.targetDeploymentId;
    if (!id) {
      await this.finish(operation, 'review_required', {
        code: 'DISPATCH_OUTCOME_UNKNOWN',
        message:
          'The dispatch outcome cannot be correlated to an exact deployment. Inspect Railway; this mutation will not be repeated.',
      });
      return;
    }
    const deployment = await this.railway.deployment(resource, id);
    const candidate = snapshot.deployments.find((item) => item.id === id);
    const updatedAt = Date.parse(deployment.updatedAt);
    if (
      (resource.deploymentId === id &&
        resource.providerUpdatedAt &&
        updatedAt < resource.providerUpdatedAt.getTime()) ||
      (candidate &&
        (updatedAt < Date.parse(candidate.updatedAt) ||
          (updatedAt === Date.parse(candidate.updatedAt) &&
            candidate.status !== deployment.status)))
    )
      throw this.staleObservation();
    const others = snapshot.deployments.filter(
      (candidate) => candidate.id !== id && !isInactive(candidate),
    );
    if (others.length) {
      await this.finish(operation, 'review_required', {
        code: 'EXTERNAL_DEPLOYMENT_DETECTED',
        message: 'Another deployment appeared. Review Railway before requesting another action.',
      });
      return;
    }
    if (
      operation.action === 'stop' &&
      deployment.status === 'REMOVED' &&
      snapshot.deployments.every(isInactive)
    ) {
      await this.finish(operation, 'succeeded', null, 'applied');
      return;
    }
    if (
      operation.action === 'start' &&
      isRunning(deployment) &&
      snapshot.deployments.some((candidate) => candidate.id === id && isRunning(candidate))
    ) {
      await this.finish(operation, 'succeeded', null, 'applied');
      return;
    }
    if (operation.action === 'start' && isInactive(deployment)) {
      const accepted = await this.resources.observe(ticket, {
        observedState: 'failed',
        providerStatus: deployment.status,
        deploymentId: id,
        providerUpdatedAt: new Date(deployment.updatedAt),
        observedAt: new Date(),
      });
      if (!accepted) throw this.staleObservation();
      await this.finish(operation, 'failed', {
        code: 'DEPLOYMENT_FAILED',
        message:
          'The deployment ended before a running workload was observed. Inspect its Railway logs.',
      });
      return;
    }
    await this.deferOrFinish(
      operation,
      new ProviderError('AWAITING_PROVIDER', 'Waiting for Railway to confirm the requested state.'),
    );
  }

  private async deferOrFinish(operation: OperationRecord, error: unknown): Promise<void> {
    const failure = safeFailure(error);
    if (
      error instanceof ProviderError &&
      error.certainty === 'rejected' &&
      error.code !== 'PROVIDER_RATE_LIMITED'
    ) {
      await this.finish(operation, operation.dispatchAt ? 'review_required' : 'failed', failure);
      return;
    }
    if (Date.now() >= operation.deadlineAt.getTime()) {
      await this.finish(operation, operation.dispatchAt ? 'review_required' : 'failed', {
        code: operation.dispatchAt ? 'RECONCILIATION_DEADLINE' : 'EXPIRED_BEFORE_DISPATCH',
        message: operation.dispatchAt
          ? 'The confirmation deadline elapsed. The workload may still be active. Review Railway before proceeding.'
          : 'The request expired before a mutation was sent.',
      });
      return;
    }
    const delay =
      error instanceof ProviderError && error.retryAfterMs
        ? error.retryAfterMs
        : checkDelay(operation.attempts, this.config.values.PROVIDER_MODE);
    await this.operations.update(operation, {
      state: operation.state === 'dispatching' ? 'reconciling' : operation.state,
      attempts: operation.attempts + 1,
      failure: failure.code === 'AWAITING_PROVIDER' ? null : failure,
      nextCheckAt: new Date(Date.now() + delay),
    });
  }

  private async finish(
    operation: OperationRecord,
    state: 'succeeded' | 'failed' | 'review_required',
    failure: Failure | null,
    outcome: 'applied' | 'already_satisfied' | null = null,
  ): Promise<void> {
    const updated = await this.operations.update(operation, {
      state,
      failure,
      outcome,
      completedAt: state === 'review_required' ? null : new Date(),
    });
    if (updated)
      logger.info({ operationId: operation.id, state, code: failure?.code }, 'Operation settled');
  }
}
