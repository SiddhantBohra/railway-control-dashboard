import type { z } from 'zod';
import { ErrorSchema } from '@control/contracts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function http<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    method?: 'POST';
    body?: unknown;
    csrfToken?: string;
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(options.method ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(
      0,
      'CONNECTION_INTERRUPTED',
      'Connection interrupted. Your request may have been accepted. Reconnect and check its status, or retry the same request.',
    );
  }
  let input: unknown;
  try {
    input = await response.json();
  } catch {
    throw new HttpError(
      response.status,
      'INVALID_RESPONSE',
      'The API returned an unreadable response. Please refresh.',
    );
  }
  if (!response.ok) {
    const parsed = ErrorSchema.safeParse(input);
    if (parsed.success)
      throw new HttpError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.requestId,
      );
    throw new HttpError(
      response.status,
      'API_UNAVAILABLE',
      'The API is unavailable. Please try again shortly.',
    );
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      502,
      'INVALID_RESPONSE',
      'The API response did not match the expected contract.',
    );
  return parsed.data;
}

export function errorMessage(error: unknown): string {
  return error instanceof HttpError ? error.message : 'Something went wrong. Please try again.';
}
