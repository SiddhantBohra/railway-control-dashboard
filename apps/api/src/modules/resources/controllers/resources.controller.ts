import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ResourcesService } from '../services/resources.service';
import { ResourceDto, ResourceListDto, ResourceParamsDto } from '../dto/resources.dto';
import { NoQuery } from '../../../common/no-query.decorator';
import { toResource } from '../mappers/resource.mapper';
import { SessionGuard, subject } from '../../auth/session.guard';
import { ApiErrors, ProtectedApi } from '../../../common/api-docs';

@ApiTags('resources')
@ProtectedApi()
@UseGuards(SessionGuard)
@Controller('api/v1/resources')
export class ResourcesController {
  constructor(@Inject(ResourcesService) private readonly resources: ResourcesService) {}

  @Get()
  @ZodResponse({ type: ResourceListDto })
  async list(@Req() request: Request, @NoQuery() _query: unknown) {
    return {
      resources: (await this.resources.list(subject(request))).map((resource) =>
        toResource(resource),
      ),
    };
  }

  @Get(':resourceId')
  @ApiErrors(400, 404)
  @ZodResponse({ type: ResourceDto })
  async get(
    @Req() request: Request,
    @Param() params: ResourceParamsDto,
    @NoQuery() _query: unknown,
  ) {
    return toResource(await this.resources.requireOwned(params.resourceId, subject(request)));
  }
}
