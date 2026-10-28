import { Inject, Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Action } from '@control/contracts';
import { ApiException } from '../../../common/api-error';
import { Config } from '../../../config/config';
import { ResourcesService } from '../../resources/services/resources.service';
import { ResourcesRepository } from '../../resources/repositories/resources.repository';
import { OperationsRepository } from '../repositories/operations.repository';
import { toOperation } from '../mappers/operation.mapper';
import { isTerminal } from '../domain/lifecycle';

const cursorSchema = z.strictObject({ acceptedAt: z.iso.datetime(), id: z.uuid() });
export function fingerprint(resourceId: string, action: Action): string {
  return createHash('sha256')
    .update(JSON.stringify({ version: 1, resourceId, action, stopBehavior: 'remove_deployment' }))
    .digest('hex');
}

@Injectable()
export class OperationsService {
  constructor(
    @Inject(Sequelize) private readonly db: Sequelize,
    @Inject(ResourcesService) private readonly access: ResourcesService,
    @Inject(ResourcesRepository) private readonly resources: ResourcesRepository,
    @Inject(OperationsRepository) private readonly operations: OperationsRepository,
    @Inject(Config) private readonly config: Config,
  ) {}

  async accept(resourceId: string, actor: string, action: Action, key: string) {
    return this.db.transaction(async (transaction) => {
      const resource = await this.access.requireOwned(resourceId, actor, transaction);
      const requestFingerprint = fingerprint(resourceId, action);
      const previous = await this.operations.byKey(actor, key, transaction);
      if (previous) {
        if (previous.fingerprint !== requestFingerprint)
          throw new ApiException(
            409,
            'IDEMPOTENCY_KEY_REUSED',
            'This idempotency key was already used for different request content.',
          );
        return { operation: toOperation(previous), replayed: true };
      }
      const busy = await this.operations.unresolved(resource.id, transaction);
      if (busy)
        throw new ApiException(
          409,
          'RESOURCE_BUSY',
          'Resolve the current operation before requesting another action.',
          busy.id,
        );
      const generation = await this.resources.setIntent(
        resource,
        action === 'start' ? 'running' : 'stopped',
        transaction,
      );
      const now = new Date();
      const record = await this.operations.create(
        {
          id: randomUUID(),
          resourceId,
          actorSubject: actor,
          action,
          generation,
          idempotencyKey: key,
          fingerprint: requestFingerprint,
          state: 'queued',
          targetDeploymentId: null,
          resultDeploymentId: null,
          baselineDeploymentIds: [],
          dispatchAt: null,
          acceptedAt: now,
          updatedAt: now,
          completedAt: null,
          nextCheckAt: now,
          deadlineAt: new Date(now.getTime() + this.config.values.OPERATION_DEADLINE_MS),
          attempts: 0,
          revision: 0,
          failure: null,
          outcome: null,
        },
        transaction,
      );
      return { operation: toOperation(record), replayed: false };
    });
  }

  async get(id: string, actor: string) {
    const operation = await this.operations.find(id, actor);
    if (!operation) throw new ApiException(404, 'OPERATION_NOT_FOUND', 'Operation not found.');
    await this.access.requireOwned(operation.resourceId, actor);
    return operation;
  }

  async history(
    resourceId: string,
    actor: string,
    query: { limit?: string | undefined; cursor?: string | undefined },
  ) {
    await this.access.requireOwned(resourceId, actor);
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (query.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new ApiException(400, 'INVALID_CURSOR', 'The history cursor is invalid.');
      }
    }
    const limit = Number(query.limit ?? '20');
    const rows = await this.operations.history(resourceId, actor, limit, cursor);
    const last = rows[limit - 1];
    const nextCursor =
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ acceptedAt: last.acceptedAt.toISOString(), id: last.id }),
          ).toString('base64url')
        : null;
    return { operations: rows.slice(0, limit).map(toOperation), nextCursor };
  }

  async reconcile(id: string, actor: string) {
    const operation = await this.get(id, actor);
    if (isTerminal(operation.state))
      throw new ApiException(409, 'OPERATION_TERMINAL', 'This operation is already complete.');
    if (operation.state !== 'review_required')
      return { operation: toOperation(operation), replayed: true };
    const updated = await this.operations.update(operation, {
      // Reconciliation never returns to queued: it can only read Railway.
      state: 'reconciling',
      nextCheckAt: new Date(),
      deadlineAt: new Date(Date.now() + this.config.values.OPERATION_DEADLINE_MS),
    });
    if (!updated)
      throw new ApiException(
        409,
        'OPERATION_CHANGED',
        'The operation changed. Refresh and try again.',
      );
    return { operation: toOperation(updated), replayed: false };
  }

  // Operator CLI only; absent from the HTTP controller. Closure acknowledges
  // uncertainty and never invents provider success or repeats a mutation.
  async closeReview(id: string, actor: string, revision: number, reason: string) {
    z.string().trim().min(20).max(1000).parse(reason);
    const initial = await this.get(id, actor);
    return this.db.transaction(async (transaction) => {
      await this.access.requireOwned(initial.resourceId, actor, transaction);
      const operation = await this.get(id, actor);
      if (operation.state !== 'review_required' || operation.revision !== revision) {
        throw new ApiException(
          409,
          'OPERATION_CHANGED',
          'Only an unchanged review-required operation can be closed.',
        );
      }
      const updated = await this.operations.update(
        operation,
        {
          state: 'failed',
          completedAt: new Date(),
          outcome: null,
          failure: {
            code: 'OPERATOR_CLOSED',
            message:
              'An operator closed this uncertain request after external review. Provider success was not confirmed; see the operator audit record.',
          },
        },
        transaction,
      );
      if (!updated)
        throw new ApiException(409, 'OPERATION_CHANGED', 'The operation changed during review.');
      await this.operations.recordReview(operation, reason.trim(), transaction);
      return toOperation(updated);
    });
  }
}
