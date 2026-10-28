import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Client } from 'pg';
import { z } from 'zod';
import { Config } from '../../../config/config';
import { logger } from '../../../common/logging';
import { OperationProcessor } from './operation.processor';

@Injectable()
export class OperationWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private connection: Client | null = null;
  private leader = false;
  private connectionLost = false;
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    @Inject(Config) private readonly config: Config,
    @Inject(OperationProcessor) private readonly processor: OperationProcessor,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.values.WORKER_ENABLED) return;
    this.connection = new Client({
      connectionString: this.config.values.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    this.connection.on('error', () => {
      this.leader = false;
      this.connectionLost = true;
      logger.error(
        { code: 'WORKER_LOCK_CONNECTION_LOST' },
        'Worker stopped; restart the API to recover',
      );
    });
    await this.connection.connect();
    this.timer = setInterval(() => this.schedule(), 1000);
    this.schedule();
  }

  private schedule(): void {
    if (this.running || this.stopping || this.connectionLost) return;
    this.running = this.tick()
      .catch(() => {
        logger.error(
          { code: 'WORKER_TICK_FAILED' },
          'Worker check failed; durable state will be retried',
        );
      })
      .finally(() => {
        this.running = null;
      });
  }

  private async tick(): Promise<void> {
    if (!this.connection) return;
    if (!this.leader) {
      const result = await this.connection.query(
        'SELECT pg_try_advisory_lock(210884, 1) AS acquired',
      );
      const rows: unknown = result.rows;
      this.leader = z.array(z.object({ acquired: z.boolean() })).parse(rows)[0]?.acquired ?? false;
    }
    await this.processor.tick(() => this.leader && !this.connectionLost && !this.stopping);
  }

  get healthy(): boolean {
    return !this.connectionLost;
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.running) await this.running;
    if (this.connection) await this.connection.end();
  }
}
