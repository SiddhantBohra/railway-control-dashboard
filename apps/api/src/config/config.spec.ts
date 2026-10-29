import { Config, parseConfig } from './config';
import { configureTestEnvironment, resourceId } from '../../test/fixtures';

beforeEach(() => configureTestEnvironment());
afterEach(() => jest.restoreAllMocks());

const target = {
  RAILWAY_TARGET_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
  RAILWAY_TARGET_ENVIRONMENT_ID: '22222222-2222-4222-8222-222222222222',
  RAILWAY_TARGET_SERVICE_ID: '33333333-3333-4333-8333-333333333333',
};
const hosting = {
  RAILWAY_PROJECT_ID: '44444444-4444-4444-8444-444444444444',
  RAILWAY_ENVIRONMENT_ID: '55555555-5555-4555-8555-555555555555',
  RAILWAY_SERVICE_ID: '66666666-6666-4666-8666-666666666666',
};

test('rejects ambiguous booleans and numbers without echoing secrets', () => {
  expect(() => parseConfig({ ...process.env, WORKER_ENABLED: 'yes' })).toThrow('WORKER_ENABLED');
  expect(() => parseConfig({ ...process.env, PORT: '3001garbage' })).toThrow('PORT');
  expect(() => parseConfig({ ...process.env, SESSION_SECRET: 'secret-value' })).toThrow(
    'Invalid configuration: SESSION_SECRET',
  );
});
test('requires all Railway scope fields and an image reference', () => {
  expect(() =>
    parseConfig({
      ...process.env,
      PROVIDER_MODE: 'railway',
      RAILWAY_TOKEN: undefined,
      RAILWAY_TARGET_PROJECT_ID: undefined,
      RAILWAY_TARGET_ENVIRONMENT_ID: undefined,
      RAILWAY_TARGET_SERVICE_ID: undefined,
      RAILWAY_IMAGE: undefined,
    }),
  ).toThrow('RAILWAY_TOKEN');
  expect(parseConfig({ ...process.env, WORKER_ENABLED: 'false' }).WORKER_ENABLED).toBe(false);
});

test('accepts exact default, tagged and digest-pinned image references in Railway mode', () => {
  for (const image of [
    'nginx',
    'nginx:latest',
    'nginx:stable-alpine',
    'ghcr.io/example/demo:v1.0',
    'registry.example.com:5000/team/demo:v1',
    `docker.io/library/nginx@sha256:${'a'.repeat(64)}`,
    `nginx:stable-alpine@sha256:${'b'.repeat(64)}`,
  ]) {
    const config = parseConfig({
      ...process.env,
      PROVIDER_MODE: 'railway',
      RAILWAY_TOKEN: 'test-only-token',
      RAILWAY_TARGET_PROJECT_ID: resourceId,
      RAILWAY_TARGET_ENVIRONMENT_ID: resourceId,
      RAILWAY_TARGET_SERVICE_ID: resourceId,
      RAILWAY_IMAGE: image,
    });
    expect(config.RAILWAY_IMAGE).toBe(image);
  }
});

test('rejects URLs, whitespace, missing names and malformed digests as image references', () => {
  for (const image of [
    '',
    ' nginx',
    'nginx latest',
    'https://hub.docker.com/_/nginx',
    '/nginx',
    'nginx/',
    'nginx:',
    'nginx@sha256:abc',
    `nginx@sha512:${'a'.repeat(64)}`,
  ]) {
    expect(() => parseConfig({ ...process.env, RAILWAY_IMAGE: image })).toThrow('RAILWAY_IMAGE');
  }
});

test.each(['PROJECT_ID', 'ENVIRONMENT_ID', 'SERVICE_ID'] as const)(
  'requires explicit target %s even when Railway injects a hosting ID',
  (field) => {
    const key = `RAILWAY_TARGET_${field}`;
    expect(() =>
      parseConfig({
        ...process.env,
        ...hosting,
        ...target,
        PROVIDER_MODE: 'railway',
        RAILWAY_TOKEN: 'test-only-token',
        RAILWAY_IMAGE: 'nginx',
        [key]: undefined,
      }),
    ).toThrow(`Invalid configuration: ${key}`);
  },
);

test('selects the managed workload scope independently of the hosting scope', () => {
  jest.replaceProperty(process, 'env', {
    ...process.env,
    ...hosting,
    ...target,
    PROVIDER_MODE: 'railway',
    RAILWAY_TOKEN: 'test-only-token',
    RAILWAY_IMAGE: 'nginx',
  });
  expect(new Config().scope).toEqual({
    projectId: target.RAILWAY_TARGET_PROJECT_ID,
    environmentId: target.RAILWAY_TARGET_ENVIRONMENT_ID,
    serviceId: target.RAILWAY_TARGET_SERVICE_ID,
    image: 'nginx',
  });
});

test('hosting IDs do not change the simulator scope', () => {
  jest.replaceProperty(process, 'env', { ...process.env, ...hosting });
  expect(new Config().scope).toEqual({
    projectId: 'mock-project',
    environmentId: 'mock-environment',
    serviceId: 'mock-service',
    image: 'mock:signal',
  });
});
