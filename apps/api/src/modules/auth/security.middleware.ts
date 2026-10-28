import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Config } from '../../config/config';

export function securityMiddleware(config: Config) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.path.startsWith('/health/')) {
      next();
      return;
    }
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const login = request.path === '/api/v1/auth/login' && unsafe;
    const windowMs = unsafe && !login ? 600000 : 60000;
    const maximum = login ? 5 : unsafe ? 10 : 180;
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    const key = `${login ? 'login' : unsafe ? 'write' : 'read'}:${request.ip ?? 'unknown'}`;
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };
    const reject = (status: number, code: string, message: string) =>
      response
        .status(status)
        .json({ error: { code, message, requestId: String(request.id ?? 'unknown') } });
    if (!buckets.has(key) && buckets.size >= 10000) {
      reject(503, 'REQUEST_CAPACITY', 'Request capacity reached. Try again later.');
      return;
    }
    buckets.set(key, bucket);
    bucket.count += 1;
    if (bucket.count > maximum) {
      response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      reject(429, 'RATE_LIMITED', 'Too many requests. Please wait before trying again.');
      return;
    }
    if (unsafe) {
      if (request.get('origin') !== config.values.PUBLIC_ORIGIN) {
        reject(403, 'INVALID_ORIGIN', 'The request origin is not allowed.');
        return;
      }
      if (!request.is('application/json')) {
        reject(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
        return;
      }
      const supplied = request.get('x-csrf-token') ?? '';
      const expected = request.session.csrfToken;
      if (
        !expected ||
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
      ) {
        reject(403, 'INVALID_CSRF_TOKEN', 'Refresh the session before trying again.');
        return;
      }
    }
    next();
  };
}
