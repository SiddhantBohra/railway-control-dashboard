import { z } from 'zod';
import { Config } from '../../config/config';
import { RailwayGraphqlClient, retryDelay } from './graphql.client';
import { configureTestEnvironment } from '../../../test/fixtures';

const originalFetch = global.fetch;
beforeEach(() => {
  configureTestEnvironment();
  process.env['RAILWAY_TOKEN'] = 'test-provider-secret';
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env['RAILWAY_TOKEN'];
});

test('HTTP 200 GraphQL errors are rejected and provider secrets are not exposed', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        errors: [
          {
            message: 'test-provider-secret internal detail',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
        data: { value: true },
      }),
      { status: 200 },
    ),
  );
  const client = new RailwayGraphqlClient(new Config());
  await expect(
    client.request('mutation Test { value }', {}, z.object({ value: z.boolean() })),
  ).rejects.toMatchObject({ code: 'PROVIDER_GRAPHQL_ERROR', certainty: 'unknown' });
  await expect(
    client.request('query Test { value }', {}, z.object({ value: z.boolean() })),
  ).rejects.not.toThrow('test-provider-secret');
});
test('a network timeout after dispatch remains uncertain and is never retried by the client', async () => {
  const fetchMock = jest.fn().mockRejectedValue(new Error('request timed out'));
  global.fetch = fetchMock;
  await expect(
    new RailwayGraphqlClient(new Config()).request(
      'mutation Test { value }',
      {},
      z.object({ value: z.boolean() }),
    ),
  ).rejects.toMatchObject({ certainty: 'unknown' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('HTTP 429 is a rejected request and imposes a cooldown', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '7' } }));
  global.fetch = fetchMock;
  const client = new RailwayGraphqlClient(new Config());
  await expect(client.request('query Test { value }', {}, z.unknown())).rejects.toMatchObject({
    code: 'PROVIDER_RATE_LIMITED',
    certainty: 'rejected',
    retryAfterMs: 7000,
  });
  await expect(client.request('query Test { value }', {}, z.unknown())).rejects.toMatchObject({
    code: 'PROVIDER_RATE_LIMITED',
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(retryDelay('nonsense')).toBe(60000);
});

test('a short Retry-After cooldown does not become a full-hour budget delay', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '7' } }));
  const client = new RailwayGraphqlClient(new Config());
  await expect(client.request('query Test { value }', {}, z.unknown())).rejects.toMatchObject({
    retryAfterMs: 7000,
  });
  try {
    await client.request('query Test { value }', {}, z.unknown());
    throw new Error('Expected cooldown');
  } catch (error) {
    expect(error).toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
    expect(
      z.object({ retryAfterMs: z.number().min(1000).max(7000) }).safeParse(error).success,
    ).toBe(true);
  }
});

test('successful responses with an exhausted provider budget pause subsequent requests', async () => {
  const fetchMock = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { value: true } }), {
      headers: {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + 10),
      },
    }),
  );
  global.fetch = fetchMock;
  const client = new RailwayGraphqlClient(new Config());
  await expect(
    client.request('query Test { value }', {}, z.object({ value: z.boolean() })),
  ).resolves.toEqual({ value: true });
  await expect(client.request('query Test { value }', {}, z.unknown())).rejects.toMatchObject({
    code: 'PROVIDER_RATE_LIMITED',
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
