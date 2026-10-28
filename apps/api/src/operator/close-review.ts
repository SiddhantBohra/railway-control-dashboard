import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../app.module';
import { Config } from '../config/config';
import { OperationsService } from '../modules/operations/services/operations.service';

async function main() {
  const [id, revision, reason] = z
    .tuple([
      z.uuid(),
      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe()),
      z.string().trim().min(20).max(1000),
    ])
    .parse(process.argv.slice(2));
  process.env['WORKER_ENABLED'] = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const operation = await app
      .get(OperationsService)
      .closeReview(id, app.get(Config).values.DEMO_USERNAME, revision, reason);
    console.info(
      JSON.stringify({
        operationId: operation.id,
        state: operation.state,
        code: operation.failure?.code,
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  console.error(
    'Review closure failed. Check the operation ID, current revision, reason (20–1000 characters), mapping and database. Usage: review:close <id> <revision> "external evidence and decision"',
  );
  process.exitCode = 1;
});
