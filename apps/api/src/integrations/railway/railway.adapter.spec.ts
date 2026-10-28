import { Config } from '../../config/config';
import { RailwayGraphqlClient } from './graphql.client';
import { RailwayAdapter } from './railway.adapter';
import { configureTestEnvironment, deployment } from '../../../test/fixtures';

const originalFetch = global.fetch;
beforeEach(() => {
  configureTestEnvironment();
  process.env['RAILWAY_TOKEN'] = 'test-only-token';
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env['RAILWAY_TOKEN'];
});
function setup() {
  const config = new Config();
  return {
    target: config.scope,
    adapter: new RailwayAdapter(new RailwayGraphqlClient(config), config),
  };
}
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    serviceInstance: {
      serviceId: 'mock-service',
      environmentId: 'mock-environment',
      numReplicas: 1,
      sleepApplication: false,
      source: { image: 'mock:signal', repo: null },
      activeDeployments: [],
      latestDeployment: deployment({ status: 'FAILED', instances: [] }),
      ...overrides,
    },
    deployments: { edges: [], pageInfo: { hasNextPage: false } },
  };
}
function respond(data: unknown) {
  global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data })));
}

test('an arbitrary target is rejected before making a network request', async () => {
  respond({});
  const { adapter, target } = setup();
  await expect(adapter.start({ ...target, serviceId: 'other-service' })).rejects.toMatchObject({
    code: 'TARGET_OUT_OF_SCOPE',
    certainty: 'rejected',
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('configuration drift and foreign deployments fail closed', async () => {
  const { adapter, target } = setup();
  respond(snapshot({ numReplicas: 2 }));
  await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'CONFIGURATION_DRIFT' });
  respond(snapshot({ latestDeployment: deployment({ serviceId: 'other-service' }) }));
  await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });
});

test('latest failed deployments and incomplete pagination are preserved as evidence', async () => {
  const { adapter, target } = setup();
  const data = snapshot();
  data.deployments.pageInfo.hasNextPage = true;
  respond(data);
  const result = await adapter.snapshot(target);
  expect(result.complete).toBe(false);
  expect(result.deployments).toEqual([deployment({ status: 'FAILED', instances: [] })]);
});

test('a false removal acknowledgement cannot be reported as success', async () => {
  const { adapter, target } = setup();
  respond({ deploymentRemove: false });
  await expect(adapter.remove(target, 'deployment-1')).rejects.toMatchObject({
    code: 'PROVIDER_NOT_ACKNOWLEDGED',
    certainty: 'unknown',
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
