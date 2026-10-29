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
  delete process.env['RAILWAY_IMAGE'];
});
function setup() {
  const config = new Config();
  return {
    target: config.scope,
    adapter: new RailwayAdapter(new RailwayGraphqlClient(config), config),
  };
}
function snapshot(overrides: Record<string, unknown> = {}, serviceConfiguration: unknown = {}) {
  return {
    environment: {
      id: 'mock-environment',
      config: {
        services: {
          'mock-service': serviceConfiguration,
          'other-service': { deploy: { unrecognized: true } },
        },
      },
    },
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

test('regional configuration verifies one replica when the legacy field is null', async () => {
  const { adapter, target } = setup();
  respond(
    snapshot(
      { numReplicas: null },
      { deploy: { multiRegionConfig: { 'asia-southeast1-eqsg3a': { numReplicas: 1 } } } },
    ),
  );
  await expect(adapter.snapshot(target)).resolves.toMatchObject({ complete: true });
  const request = JSON.parse(jest.mocked(global.fetch).mock.calls[0]?.[1]?.body as string) as {
    query: string;
    variables: { projectId: string };
  };
  expect(request.query).toContain('config(decryptVariables: false)');
  expect(request.variables.projectId).toBe(target.projectId);
});

test('unknown, malformed and multi-replica regional configurations fail closed', async () => {
  const { adapter, target } = setup();
  for (const serviceConfiguration of [
    undefined,
    {},
    { deploy: { multiRegionConfig: null } },
    { deploy: { multiRegionConfig: {} } },
    { deploy: { multiRegionConfig: { region: {} } } },
    { deploy: { multiRegionConfig: { region: { numReplicas: '1' } } } },
    { deploy: { multiRegionConfig: { region: { numReplicas: -1 } } } },
    { deploy: { multiRegionConfig: { region: { numReplicas: 0.5 } } } },
    { deploy: { multiRegionConfig: { region: { numReplicas: 2 } } } },
    { deploy: { multiRegionConfig: { first: { numReplicas: 1 }, second: { numReplicas: 1 } } } },
  ]) {
    respond(snapshot({ numReplicas: null }, serviceConfiguration));
    await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'CONFIGURATION_DRIFT' });
  }
});

test('regional and legacy replica evidence must not conflict', async () => {
  const { adapter, target } = setup();
  for (const [legacy, regional] of [
    [1, 2],
    [2, 1],
  ]) {
    respond(
      snapshot(
        { numReplicas: legacy },
        { deploy: { multiRegionConfig: { region: { numReplicas: regional } } } },
      ),
    );
    await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'CONFIGURATION_DRIFT' });
  }
});

test('scaling evidence must belong to the configured environment and service', async () => {
  const { adapter, target } = setup();
  const wrongEnvironment = snapshot();
  wrongEnvironment.environment.id = 'other-environment';
  respond(wrongEnvironment);
  await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'CONFIGURATION_DRIFT' });
  const missingService = snapshot();
  missingService.environment.config.services['mock-service'] = undefined;
  respond(missingService);
  await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'CONFIGURATION_DRIFT' });
});

test('the default image remains exactly allowlisted for observations and commands', async () => {
  process.env['RAILWAY_IMAGE'] = 'nginx';
  const { adapter, target } = setup();
  respond(snapshot({ source: { image: 'nginx', repo: null } }));
  await expect(adapter.snapshot(target)).resolves.toMatchObject({ complete: true });

  respond(snapshot({ source: { image: 'nginx:latest', repo: null } }));
  await expect(adapter.snapshot(target)).rejects.toMatchObject({ code: 'CONFIGURATION_DRIFT' });

  respond({});
  await expect(adapter.start({ ...target, image: 'redis' })).rejects.toMatchObject({
    code: 'TARGET_OUT_OF_SCOPE',
  });
  expect(global.fetch).not.toHaveBeenCalled();
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
