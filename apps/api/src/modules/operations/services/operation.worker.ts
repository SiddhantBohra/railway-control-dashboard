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
  private connectionLost = true;
  private reconnectAttempts = 0;
  private nextConnectAt = 0;
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    @Inject(Config) private readonly config: Config,
    @Inject(OperationProcessor) private readonly processor: OperationProcessor,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.values.WORKER_ENABLED) return;
    this.timer = setInterval(() => this.schedule(), 1000);
    this.schedule();
  }

  private async connect(): Promise<void> {
    const previous = this.connection;
    this.connection = null;
    this.leader = false;
    if (previous) await previous.end().catch(() => undefined);
    if (this.stopping) return;
    const connection = new Client({
      connectionString: this.config.values.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      application_name: 'railway-control-worker',
    });
    this.connection = connection;
    const lost = () => {
      if (this.connection !== connection || this.connectionLost || this.stopping) return;
      this.leader = false;
      this.connectionLost = true;
      this.nextConnectAt = Date.now() + 1000;
      logger.error(
        { code: 'WORKER_LOCK_CONNECTION_LOST' },
        'Dispatch paused; reconnecting after in-flight work settles',
      );
    };
    connection.on('error', lost);
    connection.on('end', lost);
    try {
      await connection.connect();
      this.connectionLost = false;
      this.reconnectAttempts = 0;
    } catch {
      this.connectionLost = true;
      this.nextConnectAt =
        Date.now() + Math.min(30000, 1000 * 2 ** Math.min(this.reconnectAttempts++, 5));
      logger.warn(
        { code: 'WORKER_RECONNECT_FAILED' },
        'Worker connection unavailable; retry scheduled',
      );
    }
  }

  private schedule(): void {
    if (this.running || this.stopping) return;
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
    // This runs only after the preceding tick settles: never reconnect while an
    // old dispatch is in flight, and never revive that dispatch's ownership check.
    if (!this.connection || this.connectionLost) {
      if (Date.now() < this.nextConnectAt) return;
      await this.connect();
    }
    const connection = this.connection;
    if (!connection || this.connectionLost || this.stopping) return;
    if (!this.leader) {
      try {
        const result = await connection.query('SELECT pg_try_advisory_lock(210884, 1) AS acquired');
        const rows: unknown = result.rows;
        if (!this.connectionLost)
          this.leader =
            z.array(z.object({ acquired: z.boolean() })).parse(rows)[0]?.acquired ?? false;
      } catch {
        this.leader = false;
        this.connectionLost = true;
        this.nextConnectAt = Date.now() + 1000;
        return;
      }
    }
    await this.processor.tick(
      () => this.connection === connection && this.leader && !this.connectionLost && !this.stopping,
    );
  }

  get healthy(): boolean {
    return !this.config.values.WORKER_ENABLED || !this.connectionLost;
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.running) await this.running;
    if (this.connection) await this.connection.end().catch(() => undefined);
  }
}
