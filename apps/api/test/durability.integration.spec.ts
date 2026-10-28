import { randomUUID } from 'node:crypto';
import { UniqueConstraintError, ForeignKeyConstraintError, QueryTypes } from 'sequelize';
import { MockRailwayAdapter } from '../src/integrations/railway/mock.adapter';
import { ProviderError } from '../src/integrations/railway/railway.boundary';
import type { RailwayTarget } from '../src/integrations/railway/railway.boundary';
import { OperationsService } from '../src/modules/operations/services/operations.service';
import { OperationsRepository } from '../src/modules/operations/repositories/operations.repository';
import { OperationProcessor } from '../src/modules/operations/services/operation.processor';
import { ResourcesService } from '../src/modules/resources/services/resources.service';
import { ResourcesRepository } from '../src/modules/resources/repositories/resources.repository';
import type { OperationModel } from '../src/modules/operations/models/operation.model';
import { Config } from '../src/config/config';
import { migrations } from '../src/database/migrations';
import { cleanDatabase, harness, resetData } from './harness';
import { resourceId } from './fixtures';

class FaultProvider extends MockRailwayAdapter {
  startCalls = 0;
  removeCalls = 0;
  loseStartResponse = false;
  loseRemoveResponse = false;
  override async start(target: RailwayTarget) {
    this.startCalls += 1;
    const id = await super.start(target);
    if (this.loseStartResponse)
      throw new ProviderError('PROVIDER_UNREACHABLE', 'Response lost after acceptance.');
    return id;
  }
  override async remove(target: RailwayTarget, id: string) {
    this.removeCalls += 1;
    await super.remove(target, id);
    if (this.loseRemoveResponse)
      throw new ProviderError('PROVIDER_UNREACHABLE', 'Response lost after removal.');
  }
}

let context: Awaited<ReturnType<typeof harness>>;
let provider: FaultProvider;
let service: OperationsService;
let repository: OperationsRepository;
let processor: OperationProcessor;

beforeAll(async () => {
  expect(await cleanDatabase()).toEqual(['001-initial', '002-operation-reviews']);
});
beforeEach(async () => {
  provider = new FaultProvider();
  context = await harness(provider);
  await resetData(context.db);
  service = context.app.get(OperationsService);
  repository = context.app.get(OperationsRepository);
  processor = context.app.get(OperationProcessor);
});
afterEach(async () => {
  await context.close();
});

async function processOperation(id: string) {
  await processor.process(await service.get(id, 'demo'), () => true);
}

test('migrations are repeatable and database constraints reject invalid references', async () => {
  expect(await migrations(context.db).up()).toEqual([]);
  const { operation } = await service.accept(resourceId, 'demo', 'start', randomUUID());
  const record = await service.get(operation.id, 'demo');
  const model = context.app.get<typeof OperationModel>('OperationModelRepository');
  await expect(
    model.create({ ...record, id: randomUUID(), idempotencyKey: randomUUID() }),
  ).rejects.toBeInstanceOf(UniqueConstraintError);
  await expect(
    model.create({
      ...record,
      id: randomUUID(),
      resourceId: randomUUID(),
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toBeInstanceOf(ForeignKeyConstraintError);
});

test('simultaneous duplicate requests share one durable operation', async () => {
  const key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => service.accept(resourceId, 'demo', 'start', key)),
  );
  expect(new Set(results.map((result) => result.operation.id)).size).toBe(1);
  expect(results.filter((result) => !result.replayed)).toHaveLength(1);
  await processOperation(results[0]?.operation.id ?? 'missing');
  expect(provider.startCalls).toBe(1);
});

test('same key with different content fails clearly', async () => {
  const key = randomUUID();
  await service.accept(resourceId, 'demo', 'start', key);
  await expect(service.accept(resourceId, 'demo', 'stop', key)).rejects.toMatchObject({
    response: { code: 'IDEMPOTENCY_KEY_REUSED' },
  });
});

test('concurrent start and stop allow only one unresolved operation', async () => {
  const results = await Promise.allSettled([
    service.accept(resourceId, 'demo', 'start', randomUUID()),
    service.accept(resourceId, 'demo', 'stop', randomUUID()),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.find((result) => result.status === 'rejected');
  expect(rejected).toMatchObject({
    status: 'rejected',
    reason: { response: { code: 'RESOURCE_BUSY' } },
  });
});

test('an operation insert failure rolls back the intended state', async () => {
  jest.spyOn(repository, 'create').mockRejectedValueOnce(new Error('database write interrupted'));
  await expect(service.accept(resourceId, 'demo', 'start', randomUUID())).rejects.toThrow(
    'database write interrupted',
  );
  const resource = await context.app.get(ResourcesService).requireOwned(resourceId, 'demo');
  expect(resource.generation).toBe(0);
  expect(resource.intendedState).toBeNull();
});

test('a complete start-stop-start cycle preserves the managed resource', async () => {
  for (const action of ['start', 'stop', 'start'] as const) {
    const { operation } = await service.accept(resourceId, 'demo', action, randomUUID());
    await processOperation(operation.id);
    await processOperation(operation.id);
    expect((await service.get(operation.id, 'demo')).state).toBe('succeeded');
  }
  expect(provider.startCalls).toBe(2);
  expect(provider.removeCalls).toBe(1);
  expect(
    (await context.app.get(ResourcesService).requireOwned(resourceId, 'demo')).observedState,
  ).toBe('running');
});

test('timeout after start acceptance does not repeat an uncorrelated mutation', async () => {
  provider.loseStartResponse = true;
  const { operation } = await service.accept(resourceId, 'demo', 'start', randomUUID());
  await processOperation(operation.id);
  await processOperation(operation.id);
  expect((await service.get(operation.id, 'demo')).state).toBe('review_required');
  await service.reconcile(operation.id, 'demo');
  await processOperation(operation.id);
  expect(provider.startCalls).toBe(1);
  await expect(service.accept(resourceId, 'demo', 'stop', randomUUID())).rejects.toMatchObject({
    response: { code: 'RESOURCE_BUSY' },
  });
});

test('timeout after removal is resolved using the exact target ID', async () => {
  await provider.start(new Config().scope);
  provider.loseRemoveResponse = true;
  const { operation } = await service.accept(resourceId, 'demo', 'stop', randomUUID());
  await processOperation(operation.id);
  await processOperation(operation.id);
  expect((await service.get(operation.id, 'demo')).state).toBe('succeeded');
  expect(provider.removeCalls).toBe(1);
});

test('a new API process recovers a queued operation from PostgreSQL', async () => {
  const { operation } = await service.accept(resourceId, 'demo', 'start', randomUUID());
  await context.close();
  context = await harness(provider);
  const recoveredService = context.app.get(OperationsService);
  const recoveredProcessor = context.app.get(OperationProcessor);
  await recoveredProcessor.process(await recoveredService.get(operation.id, 'demo'), () => true);
  await recoveredProcessor.process(await recoveredService.get(operation.id, 'demo'), () => true);
  expect((await recoveredService.get(operation.id, 'demo')).state).toBe('succeeded');
  expect(provider.startCalls).toBe(1);
});

test('a persisted dispatch marker is never treated as permission to resend', async () => {
  const { operation } = await service.accept(resourceId, 'demo', 'start', randomUUID());
  const record = await service.get(operation.id, 'demo');
  await repository.update(record, { state: 'dispatching', dispatchAt: new Date() });
  await processOperation(operation.id);
  expect(provider.startCalls).toBe(0);
  expect((await service.get(operation.id, 'demo')).state).toBe('review_required');
});

test('stale observations cannot overwrite newer observations or a newer intent', async () => {
  const resources = context.app.get(ResourcesRepository);
  const resource = await context.app.get(ResourcesService).requireOwned(resourceId, 'demo');
  const first = await resources.beginObservation(resource);
  const second = await resources.beginObservation(resource);
  if (!first || !second) throw new Error('Observation tickets missing');
  const update = {
    observedState: 'running' as const,
    deploymentId: 'a',
    providerStatus: 'SUCCESS',
    providerUpdatedAt: new Date(),
    observedAt: new Date(),
  };
  expect(await resources.observe(second, update)).toBe(true);
  expect(await resources.observe(first, { ...update, observedState: 'stopped' })).toBe(false);
  const third = await resources.beginObservation(resource);
  if (!third) throw new Error('Observation ticket missing');
  await service.accept(resourceId, 'demo', 'stop', randomUUID());
  expect(await resources.observe(third, update)).toBe(false);
});

test('operator closure is revision-checked, audited and never claims provider success', async () => {
  provider.loseStartResponse = true;
  const { operation } = await service.accept(resourceId, 'demo', 'start', randomUUID());
  await processOperation(operation.id);
  await processOperation(operation.id);
  const review = await service.get(operation.id, 'demo');
  const reason =
    'Inspected provider activity and exact deployment; accepting uncertainty after external review.';
  await expect(
    service.closeReview(review.id, 'demo', review.revision - 1, reason),
  ).rejects.toMatchObject({ response: { code: 'OPERATION_CHANGED' } });
  jest.spyOn(repository, 'recordReview').mockRejectedValueOnce(new Error('audit write failed'));
  await expect(service.closeReview(review.id, 'demo', review.revision, reason)).rejects.toThrow(
    'audit write failed',
  );
  expect((await service.get(review.id, 'demo')).state).toBe('review_required');
  const closed = await service.closeReview(review.id, 'demo', review.revision, reason);
  expect(closed).toMatchObject({
    state: 'failed',
    outcome: null,
    failure: { code: 'OPERATOR_CLOSED' },
  });
  const rows = await context.db.query<{ reason: string; prior_revision: number }>(
    'SELECT reason, prior_revision FROM operation_reviews WHERE operation_id = $id',
    { type: QueryTypes.SELECT, bind: { id: review.id } },
  );
  expect(rows).toEqual([{ reason, prior_revision: review.revision }]);
  expect(provider.startCalls).toBe(1);
  await expect(service.accept(resourceId, 'demo', 'stop', randomUUID())).resolves.toMatchObject({
    replayed: false,
  });
});

test('a fresh complete empty snapshot clears the prior deployment without being blocked by its timestamp', async () => {
  const resources = context.app.get(ResourcesRepository);
  const resource = await context.app.get(ResourcesService).requireOwned(resourceId, 'demo');
  const first = await resources.beginObservation(resource);
  if (!first) throw new Error('Missing observation ticket');
  await resources.observe(first, {
    observedState: 'running',
    deploymentId: 'old',
    providerStatus: 'SUCCESS',
    providerUpdatedAt: new Date(),
    observedAt: new Date(),
  });
  const second = await resources.beginObservation(resource);
  if (!second) throw new Error('Missing observation ticket');
  expect(
    await resources.observe(second, {
      observedState: 'stopped',
      deploymentId: null,
      providerStatus: null,
      providerUpdatedAt: null,
      observedAt: new Date(),
    }),
  ).toBe(true);
  expect(
    (await context.app.get(ResourcesService).requireOwned(resourceId, 'demo')).observedState,
  ).toBe('stopped');
});

test('history pagination is bounded and ordered without exposing provider credentials', async () => {
  for (let index = 0; index < 3; index += 1) {
    const { operation } = await service.accept(resourceId, 'demo', 'stop', randomUUID());
    await processOperation(operation.id);
  }
  const page = await service.history(resourceId, 'demo', { limit: '2' });
  expect(page.operations).toHaveLength(2);
  expect(page.nextCursor).not.toBeNull();
  const next = await service.history(resourceId, 'demo', {
    limit: '2',
    cursor: page.nextCursor ?? undefined,
  });
  expect(next.operations).toHaveLength(1);
  const ids = [...page.operations, ...next.operations].map((operation) => operation.id);
  expect(new Set(ids).size).toBe(3);
  const rows = await context.db.query<{ count: string }>('SELECT count(*) FROM operations', {
    type: QueryTypes.SELECT,
  });
  expect(rows[0]?.count).toBe('3');
});
