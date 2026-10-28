import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ResourcesModule } from '../resources/resources.module';
import { RailwayModule } from '../../integrations/railway/railway.module';
import { OperationModel } from './models/operation.model';
import { OperationsRepository } from './repositories/operations.repository';
import { OperationsService } from './services/operations.service';
import { OperationProcessor } from './services/operation.processor';
import { OperationWorker } from './services/operation.worker';
import { OperationsController } from './controllers/operations.controller';

@Module({
  imports: [ResourcesModule, RailwayModule, SequelizeModule.forFeature([OperationModel])],
  providers: [OperationsRepository, OperationsService, OperationProcessor, OperationWorker],
  controllers: [OperationsController],
  exports: [OperationWorker],
})
export class OperationsModule {}
