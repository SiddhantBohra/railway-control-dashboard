import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { IdempotencyKeySchema } from '@control/contracts';
import { OperationsService } from '../services/operations.service';
import {
  CommandDto,
  HistoryQueryDto,
  OperationDto,
  OperationListDto,
  OperationParamsDto,
  OperationResultDto,
} from '../dto/operations.dto';
import { EmptyDto, ResourceParamsDto } from '../../resources/dto/resources.dto';
import { SessionGuard, subject } from '../../auth/session.guard';
import { ApiErrors, CsrfHeader, ProtectedApi } from '../../../common/api-docs';
import { toOperation } from '../mappers/operation.mapper';
import { isTerminal } from '../domain/lifecycle';
import { NoQuery } from '../../../common/no-query.decorator';

@ApiTags('operations')
@ProtectedApi()
@ApiErrors(400, 404)
@UseGuards(SessionGuard)
@Controller('api/v1')
export class OperationsController {
  constructor(@Inject(OperationsService) private readonly operations: OperationsService) {}

  @Post('resources/:resourceId/operations')
  @CsrfHeader()
  @ApiErrors(409)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'Reuse this key only for retries of the same request.',
  })
  @ApiResponse({
    status: 200,
    type: OperationResultDto.Output,
    description: 'Replay of a completed operation',
  })
  @ZodResponse({
    status: 202,
    type: OperationResultDto,
    description:
      'Intent durably accepted; completion is asynchronous. Location identifies the operation.',
  })
  async accept(
    @Req() request: Request,
    @Param() params: ResourceParamsDto,
    @Body() body: CommandDto,
    @NoQuery() _query: unknown,
    @Headers('idempotency-key') key: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.operations.accept(
      params.resourceId,
      subject(request),
      body.action,
      IdempotencyKeySchema.parse(key),
    );
    response.setHeader('Location', `/api/v1/operations/${result.operation.id}`);
    if (result.replayed && isTerminal(result.operation.state)) response.status(200);
    return result;
  }

  @Get('operations/:operationId')
  @ZodResponse({ type: OperationDto })
  async get(
    @Req() request: Request,
    @Param() params: OperationParamsDto,
    @NoQuery() _query: unknown,
  ) {
    return toOperation(await this.operations.get(params.operationId, subject(request)));
  }

  @Get('resources/:resourceId/operations')
  @ZodResponse({ type: OperationListDto })
  async history(
    @Req() request: Request,
    @Param() params: ResourceParamsDto,
    @Query() query: HistoryQueryDto,
  ) {
    return this.operations.history(params.resourceId, subject(request), query);
  }

  @Post('operations/:operationId/reconcile')
  @CsrfHeader()
  @ApiErrors(409)
  @ZodResponse({
    status: 202,
    type: OperationResultDto,
    description: 'Schedule read-only reconciliation; never repeats a provider mutation.',
  })
  async reconcile(
    @Req() request: Request,
    @Param() params: OperationParamsDto,
    @Body() _body: EmptyDto,
    @NoQuery() _query: unknown,
  ) {
    return this.operations.reconcile(params.operationId, subject(request));
  }
}
