import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Config } from '../../config/config';
import { logger } from '../../common/logging';
import { ProviderError } from './railway.boundary';

const envelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z
          .object({ code: z.string().optional(), traceId: z.string().max(128).optional() })
          .optional(),
      }),
    )
    .optional(),
});

export function retryDelay(value: string | null, now = Date.now()): number {
  if (!value) return 60000;
  const seconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) ? Math.min(3600000, Math.max(1000, seconds)) : 60000;
}

@Injectable()
export class RailwayGraphqlClient {
  private blockedUntil = 0;
  private requestTimes: number[] = [];

  constructor(@Inject(Config) private readonly config: Config) {}

  async request<T>(
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter((time) => time > now - 3600000);
    if (now < this.blockedUntil || this.requestTimes.length >= 80) {
      const budgetDelay =
        this.requestTimes.length >= 80 ? (this.requestTimes[0] ?? now) + 3600000 - now : 0;
      throw new ProviderError(
        'PROVIDER_RATE_LIMITED',
        'Railway request budget is exhausted. Checks will resume automatically.',
        'rejected',
        Math.max(1000, this.blockedUntil - now, budgetDelay),
      );
    }
    const token = this.config.values.RAILWAY_TOKEN;
    if (!token)
      throw new ProviderError(
        'PROVIDER_CONFIGURATION',
        'Railway credentials are not configured.',
        'rejected',
      );
    this.requestTimes.push(now);
    let response: Response;
    try {
      response = await fetch('https://backboard.railway.com/graphql/v2', {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ProviderError(
        'PROVIDER_UNREACHABLE',
        'Railway did not return a response. The outcome may be uncertain.',
      );
    }
    if (response.status === 429) {
      const delay = retryDelay(response.headers.get('retry-after'));
      this.blockedUntil = Date.now() + delay;
      throw new ProviderError(
        'PROVIDER_RATE_LIMITED',
        'Railway rate limited this request.',
        'rejected',
        delay,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        'PROVIDER_FORBIDDEN',
        'Railway denied access. Check the environment-scoped token.',
        'rejected',
      );
    }
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = response.headers.get('x-ratelimit-reset');
      const resetAt = reset && /^\d+$/.test(reset) ? Number(reset) * 1000 : Date.parse(reset ?? '');
      this.blockedUntil = Number.isFinite(resetAt)
        ? Math.max(Date.now() + 1000, resetAt)
        : Date.now() + 60000;
    }
    if (!response.ok && response.status !== 400)
      throw new ProviderError('PROVIDER_UNAVAILABLE', 'Railway is temporarily unavailable.');
    let input: unknown;
    try {
      const text = await response.text();
      if (text.length > 262144) throw new Error('Response too large');
      input = JSON.parse(text);
    } catch {
      throw new ProviderError(
        'PROVIDER_INVALID_RESPONSE',
        'Railway returned an unreadable response.',
      );
    }
    const envelope = envelopeSchema.safeParse(input);
    if (!envelope.success)
      throw new ProviderError(
        'PROVIDER_INVALID_RESPONSE',
        'Railway returned an unexpected response.',
      );
    if (envelope.data.errors?.length) {
      const errors = envelope.data.errors;
      logger.warn(
        {
          codes: errors.map((error) => error.extensions?.code),
          traceIds: errors.map((error) => error.extensions?.traceId),
        },
        'Railway GraphQL errors',
      );
      if (errors.every((error) => /not authorized|unauthorized|forbidden/i.test(error.message))) {
        throw new ProviderError(
          'PROVIDER_FORBIDDEN',
          'Railway denied access. Check token permissions.',
          'rejected',
        );
      }
      if (
        errors.every((error) =>
          ['GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED'].includes(
            error.extensions?.code ?? '',
          ),
        )
      ) {
        throw new ProviderError(
          'PROVIDER_SCHEMA_CHANGED',
          'Railway rejected the API document. An adapter update is needed.',
          'rejected',
        );
      }
      // Even HTTP 200 with partial data may have performed a mutation.
      throw new ProviderError(
        'PROVIDER_GRAPHQL_ERROR',
        'Railway reported an error. The operation needs reconciliation.',
      );
    }
    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success)
      throw new ProviderError(
        'PROVIDER_INVALID_RESPONSE',
        'Railway returned an unexpected response shape.',
      );
    return parsed.data;
  }
}
