import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ResourceModel } from './models/resource.model';
import { ResourcesRepository } from './repositories/resources.repository';
import { ResourcesService } from './services/resources.service';
import { ResourcesController } from './controllers/resources.controller';

@Module({
  imports: [SequelizeModule.forFeature([ResourceModel])],
  providers: [ResourcesRepository, ResourcesService],
  controllers: [ResourcesController],
  exports: [ResourcesRepository, ResourcesService],
})
export class ResourcesModule {}
