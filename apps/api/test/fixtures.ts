import type { Deployment } from '../src/integrations/railway/railway.boundary';

export const resourceId = '3b705c6a-d850-4e52-bdc3-1cbb10954f62';
export const localPasswordHash =
  '$argon2id$v=19$m=65536,p=4,t=3$QB/BwCWl6LnANSosOYrxww$qF/XiYIuYtVJSC2JmVAenmbBWVogz7lDtM46a4oOsms';
export function configureTestEnvironment(
  databaseUrl = 'postgres://control:local-development-only@localhost:55432/control_test',
) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    PUBLIC_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-session-secret-at-least-32-characters',
    DEMO_USERNAME: 'demo',
    DEMO_PASSWORD_HASH: localPasswordHash,
    PROVIDER_MODE: 'mock',
    WORKER_ENABLED: 'false',
    RESOURCE_ID: resourceId,
    RESOURCE_NAME: 'Signal demo',
  });
}
export function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 'deployment-1',
    status: 'SUCCESS',
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    projectId: 'mock-project',
    environmentId: 'mock-environment',
    serviceId: 'mock-service',
    instances: [{ id: 'instance-1', status: 'RUNNING' }],
    ...overrides,
  };
}
