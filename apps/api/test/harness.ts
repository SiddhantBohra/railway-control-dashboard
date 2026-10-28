import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Sequelize } from 'sequelize-typescript';
import { database, migrations } from '../src/database/migrations';
import { configureTestEnvironment } from './fixtures';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { RailwayLifecycle } from '../src/integrations/railway/railway.boundary';
import { Config } from '../src/config/config';
import { seedResource } from '../src/database/seed';

export function testDatabaseUrl(): string {
  const value =
    process.env['TEST_DATABASE_URL'] ??
    'postgres://control:local-development-only@localhost:55432/control_test';
  const url = new URL(value);
  if (
    !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
    !url.pathname.endsWith('_test')
  ) {
    throw new Error('Integration tests require a local database with a name ending in _test');
  }
  return value;
}

export async function cleanDatabase() {
  configureTestEnvironment(testDatabaseUrl());
  const db = database(testDatabaseUrl());
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const applied = await migrations(db).up();
    return applied.map((migration) => migration.name);
  } finally {
    await db.close();
  }
}

export async function harness(provider: RailwayLifecycle) {
  configureTestEnvironment(testDatabaseUrl());
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RailwayLifecycle)
    .useValue(provider)
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  const infrastructure = configureApp(app);
  await app.init();
  return {
    app,
    document: infrastructure.document,
    db: app.get(Sequelize),
    async close() {
      await app.close();
      await infrastructure.close();
    },
  };
}

export async function resetData(db: Sequelize) {
  await db.query('TRUNCATE operations, managed_resources CASCADE;');
  await seedResource(new Config());
}
