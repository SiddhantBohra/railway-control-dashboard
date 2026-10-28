import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { Config } from './config/config';
import { logger } from './common/logging';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: false,
  });
  const infrastructure = configureApp(app);
  const shutdown = async () => {
    await app.close();
    await infrastructure.close();
  };
  process.once('SIGTERM', () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  });
  process.once('SIGINT', () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  });
  await app.listen(app.get(Config).values.PORT, '::');
  logger.info(
    { mode: app.get(Config).values.PROVIDER_MODE, port: app.get(Config).values.PORT },
    'Railway Control API listening',
  );
}
main().catch(() => {
  logger.fatal(
    { code: 'STARTUP_FAILED' },
    'Startup failed. Check configuration, migrations and database access.',
  );
  process.exitCode = 1;
});
