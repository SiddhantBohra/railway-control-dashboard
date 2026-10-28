import { parseConfig } from './config';
import { configureTestEnvironment } from '../../test/fixtures';

beforeEach(() => configureTestEnvironment());

test('rejects ambiguous booleans and numbers without echoing secrets', () => {
  expect(() => parseConfig({ ...process.env, WORKER_ENABLED: 'yes' })).toThrow('WORKER_ENABLED');
  expect(() => parseConfig({ ...process.env, PORT: '3001garbage' })).toThrow('PORT');
  expect(() => parseConfig({ ...process.env, SESSION_SECRET: 'secret-value' })).toThrow(
    'Invalid configuration: SESSION_SECRET',
  );
});
test('requires all Railway scope fields and a pinned image', () => {
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
