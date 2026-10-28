import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { HealthSchema } from '@control/contracts';
import { OperationsModule } from '../operations/operations.module';
import { OperationWorker } from '../operations/services/operation.worker';

class HealthDto extends createZodDto(HealthSchema) {}

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(
    @Inject(Sequelize) private readonly db: Sequelize,
    @Inject(OperationWorker) private readonly worker: OperationWorker,
  ) {}
  @Get('live')
  @ZodResponse({ type: HealthDto })
  live() {
    return { status: 'ok' as const };
  }
  @Get('ready')
  @ApiResponse({ status: 503, description: 'Database, migrations or processor unavailable' })
  @ZodResponse({ type: HealthDto })
  async ready() {
    try {
      await this.db.query('SELECT id FROM managed_resources LIMIT 1');
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!this.worker.healthy) throw new ServiceUnavailableException();
    return { status: 'ok' as const };
  }
}
@Module({ imports: [OperationsModule], controllers: [HealthController] })
export class HealthModule {}
