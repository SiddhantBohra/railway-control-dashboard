import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { Config } from './config/config';
import { logger } from './common/logging';
import { securityMiddleware } from './modules/auth/security.middleware';
import { subject } from './modules/auth/session.guard';

export function configureApp(app: NestExpressApplication) {
  const config = app.get(Config);
  app.set('trust proxy', config.values.PROXY_TRUST_HOPS);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (_request, response) => {
        const id = randomUUID();
        response.setHeader('X-Request-Id', id);
        return id;
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  const pool = new Pool({ connectionString: config.values.DATABASE_URL, max: 3 });
  pool.on('error', () =>
    logger.error({ code: 'SESSION_DATABASE_UNAVAILABLE' }, 'Session database connection failed'),
  );
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: 900,
    errorLog: () => logger.error({ code: 'SESSION_STORE_ERROR' }, 'Session store failed'),
  });
  app.use(
    session({
      name: config.values.NODE_ENV === 'production' ? '__Host-control.sid' : 'control.sid',
      secret: config.values.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.values.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 8 * 3600000,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(securityMiddleware(config));
  app.use(
    '/api/docs',
    (request: Parameters<typeof subject>[0], response: Response, next: NextFunction) => {
      try {
        subject(request);
        next();
      } catch {
        response.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Sign in to read API documentation.',
            requestId: String(request.id),
          },
        });
      }
    },
  );
  app.useBodyParser('json', { limit: '16kb' });
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Railway Control API')
        .setDescription(
          'Protected single-workload control. Stop removes a deployment; it never deletes a service. 202 means accepted, not complete.',
        )
        .setVersion('1.0.0')
        .setOpenAPIVersion('3.1.0')
        .addCookieAuth(
          config.values.NODE_ENV === 'production' ? '__Host-control.sid' : 'control.sid',
          { type: 'apiKey', in: 'cookie' },
          'session',
        )
        .build(),
    ),
    { version: '3.1' },
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: '/api/docs/openapi.json',
    swaggerOptions: { persistAuthorization: false },
  });
  return {
    document,
    async close() {
      store.close();
      await pool.end();
    },
  };
}
