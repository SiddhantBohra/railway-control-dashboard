import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  SessionSchema,
  OperationResultSchema,
  ErrorSchema,
  ResourceListSchema,
} from '@control/contracts';
import { MockRailwayAdapter } from '../src/integrations/railway/mock.adapter';
import { cleanDatabase, harness, resetData } from './harness';
import { resourceId } from './fixtures';

let context: Awaited<ReturnType<typeof harness>>;
let agent: ReturnType<typeof request.agent>;
let csrf: string;
beforeAll(async () => {
  await cleanDatabase();
});
beforeEach(async () => {
  context = await harness(new MockRailwayAdapter());
  await resetData(context.db);
  agent = request.agent(context.app.getHttpServer());
  const response = await agent.get('/api/v1/auth/session').expect(200);
  csrf = SessionSchema.parse(response.body).csrfToken;
});
afterEach(async () => {
  await context.close();
});

async function login() {
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'demo', password: 'local-demo-only' })
    .expect(200);
  csrf = SessionSchema.parse(response.body).csrfToken;
  return response;
}
function command(body: object = { action: 'start' }) {
  return agent
    .post(`/api/v1/resources/${resourceId}/operations`)
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', randomUUID())
    .send(body);
}

test('reads and API documentation are protected', async () => {
  await agent.get('/api/v1/resources').expect(401);
  await agent.get('/api/docs/openapi.json').expect(401);
  await login();
  const resources = await agent.get('/api/v1/resources').expect(200);
  expect(ResourceListSchema.parse(resources.body).resources[0]?.mode).toBe('mock');
  await agent.get(`/api/v1/resources/${randomUUID()}`).expect(404);
  await agent.get(`/api/v1/operations/${randomUUID()}`).expect(404);
});

test('validates credentials before Passport, rejects unknown fields and does not leak passwords', async () => {
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'demo', password: { secret: 'never-echo-this' }, extra: true })
    .expect(400);
  expect(ErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  expect(response.text).not.toContain('never-echo-this');
  expect(response.text).not.toContain('stack');
  await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'demo', password: 'incorrect-password' })
    .expect(401);
});

test('rotates login session and enforces origin plus CSRF', async () => {
  const loginResponse = await login();
  expect(loginResponse.headers['set-cookie']).toEqual(
    expect.arrayContaining([expect.stringContaining('HttpOnly')]),
  );
  expect(loginResponse.headers['set-cookie']).toEqual(
    expect.arrayContaining([expect.stringContaining('SameSite=Strict')]),
  );
  await agent
    .post(`/api/v1/resources/${resourceId}/operations`)
    .set('Origin', 'https://untrusted.example')
    .set('X-CSRF-Token', csrf)
    .send({ action: 'start' })
    .expect(403);
  await agent
    .post(`/api/v1/resources/${resourceId}/operations`)
    .set('Origin', 'http://localhost:3000')
    .send({ action: 'start' })
    .expect(403);
  await agent
    .post('/api/v1/auth/logout')
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({})
    .expect(200);
  await agent.get('/api/v1/resources').expect(401);
});

test('validates params, query, body and idempotency headers', async () => {
  await login();
  await agent.get('/api/v1/resources/not-a-uuid').expect(400);
  await agent.get(`/api/v1/resources/${resourceId}/operations?limit=1garbage`).expect(400);
  await agent.get(`/api/v1/resources/${resourceId}/operations?limit=51`).expect(400);
  await agent.get('/api/v1/resources?extra=ignored').expect(400);
  await command({ action: 'start', projectId: 'arbitrary-target' }).expect(400);
  await command({ action: 'delete' }).expect(400);
  await agent
    .post(`/api/v1/resources/${resourceId}/operations`)
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({ action: 'start' })
    .expect(400);
});

test('202 exposes a durable identifier, duplicate requests replay, conflicts are safe', async () => {
  await login();
  const key = randomUUID();
  const send = (action: string) =>
    agent
      .post(`/api/v1/resources/${resourceId}/operations`)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', key)
      .send({ action });
  const first = await send('start').expect(202);
  const accepted = OperationResultSchema.parse(first.body);
  expect(first.headers['location']).toBe(`/api/v1/operations/${accepted.operation.id}`);
  expect(accepted.operation.state).toBe('queued');
  const replay = OperationResultSchema.parse((await send('start').expect(202)).body);
  expect(replay.operation.id).toBe(accepted.operation.id);
  expect(replay.replayed).toBe(true);
  expect(ErrorSchema.parse((await send('stop').expect(409)).body).error.code).toBe(
    'IDEMPOTENCY_KEY_REUSED',
  );
  expect(ErrorSchema.parse((await command({ action: 'stop' }).expect(409)).body).error.code).toBe(
    'RESOURCE_BUSY',
  );
});

test('generated OpenAPI contains actual routes, schemas, authentication and async responses', async () => {
  await login();
  const response = await agent.get('/api/docs/openapi.json').expect(200);
  const document = z
    .object({
      openapi: z.string(),
      paths: z.record(z.string(), z.unknown()),
      components: z.object({
        schemas: z.record(z.string(), z.unknown()),
        securitySchemes: z.record(z.string(), z.unknown()),
      }),
    })
    .parse(response.body);
  expect(document.openapi).toBe('3.1.0');
  const commandDoc = z
    .object({
      post: z.object({
        responses: z.record(z.string(), z.unknown()),
        security: z.array(z.unknown()),
        parameters: z.array(z.object({ name: z.string() })),
      }),
    })
    .parse(document.paths['/api/v1/resources/{resourceId}/operations']);
  expect(Object.keys(commandDoc.post.responses)).toEqual(
    expect.arrayContaining(['200', '202', '400', '401', '403', '404', '409', '429']),
  );
  expect(commandDoc.post.parameters.map((param) => param.name)).toEqual(
    expect.arrayContaining(['Idempotency-Key', 'X-CSRF-Token', 'resourceId']),
  );
  expect(document.components.securitySchemes['session']).toBeDefined();
  expect(JSON.stringify(document)).not.toContain('local-demo-only');
});

test('oversized, malformed and non-JSON bodies are rejected without echoing submitted data', async () => {
  const post = () =>
    agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf);
  const large = await post()
    .send({ username: 'demo', password: 'private-marker'.repeat(2000) })
    .expect(413);
  expect(ErrorSchema.parse(large.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  expect(large.text).not.toContain('private-marker');
  const invalid = await post()
    .set('Content-Type', 'application/json')
    .send('{"password":"private-marker"')
    .expect(400);
  // Nest wraps SyntaxError as BadRequestException before the global filter.
  expect(ErrorSchema.parse(invalid.body).error.code).toBe('REQUEST_REJECTED');
  expect(invalid.text).not.toContain('private-marker');
  await post().set('Content-Type', 'text/plain').send('private-marker').expect(415);
});

test('login attempt limits include Retry-After and do not allow unlimited password checks', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send({ username: 'demo', password: 'wrong' })
      .expect(401);
  }
  const limited = await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:3000')
    .set('X-CSRF-Token', csrf)
    .send({ username: 'demo', password: 'local-demo-only' })
    .expect(429);
  expect(ErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
});
