import { parseConfig } from './config';
import { configureTestEnvironment, resourceId } from '../../test/fixtures';

beforeEach(() => configureTestEnvironment());

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
      RAILWAY_PROJECT_ID: undefined,
      RAILWAY_ENVIRONMENT_ID: undefined,
      RAILWAY_SERVICE_ID: undefined,
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
      RAILWAY_PROJECT_ID: resourceId,
      RAILWAY_ENVIRONMENT_ID: resourceId,
      RAILWAY_SERVICE_ID: resourceId,
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
