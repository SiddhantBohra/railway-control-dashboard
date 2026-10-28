import { Global, Injectable, Module } from '@nestjs/common';
import { z } from 'zod';

const positiveInteger = (fallback: string, maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(maximum));
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInteger('3001', 65535),
    DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value)),
    PUBLIC_ORIGIN: z.url().refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    }),
    SESSION_SECRET: z.string().min(32),
    DEMO_USERNAME: z.string().min(1).max(100),
    DEMO_PASSWORD_HASH: z.string().regex(/^\$argon2id\$/),
    PROVIDER_MODE: z.enum(['mock', 'railway']).default('mock'),
    WORKER_ENABLED: boolean.default(true),
    RESOURCE_ID: z.uuid(),
    RESOURCE_NAME: z.string().min(1).max(100).default('Signal demo'),
    RAILWAY_TOKEN: z.string().min(1).optional(),
    RAILWAY_PROJECT_ID: z.uuid().optional(),
    RAILWAY_ENVIRONMENT_ID: z.uuid().optional(),
    RAILWAY_SERVICE_ID: z.uuid().optional(),
    RAILWAY_IMAGE: z
      .string()
      .regex(/^[\w./:-]+@sha256:[a-f0-9]{64}$/)
      .optional(),
    PROXY_TRUST_HOPS: z
      .string()
      .regex(/^[0-2]$/)
      .default('0')
      .transform(Number),
    PROVIDER_IDLE_MS: positiveInteger('120000', 3600000),
    OPERATION_DEADLINE_MS: positiveInteger('600000', 1800000),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV === 'production' && !config.PUBLIC_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_ORIGIN'],
        message: 'HTTPS required in production',
      });
    }
    if (config.PROVIDER_MODE === 'railway') {
      for (const key of [
        'RAILWAY_TOKEN',
        'RAILWAY_PROJECT_ID',
        'RAILWAY_ENVIRONMENT_ID',
        'RAILWAY_SERVICE_ID',
        'RAILWAY_IMAGE',
      ] as const) {
        if (!config[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required in railway mode' });
      }
    }
  });

export function parseConfig(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    // Configuration values may be credentials. Only field names are safe to report.
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}

@Injectable()
export class Config {
  readonly values = parseConfig(process.env);

  get scope() {
    return {
      projectId: this.values.RAILWAY_PROJECT_ID ?? 'mock-project',
      environmentId: this.values.RAILWAY_ENVIRONMENT_ID ?? 'mock-environment',
      serviceId: this.values.RAILWAY_SERVICE_ID ?? 'mock-service',
      image: this.values.RAILWAY_IMAGE ?? 'mock:signal',
    };
  }
}

@Global()
@Module({ providers: [Config], exports: [Config] })
export class ConfigModule {}
