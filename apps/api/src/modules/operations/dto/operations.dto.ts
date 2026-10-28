import { createZodDto } from 'nestjs-zod';
import {
  CommandSchema,
  HistoryQuerySchema,
  OperationListSchema,
  OperationParamsSchema,
  OperationResultSchema,
  OperationSchema,
} from '@control/contracts';

export class CommandDto extends createZodDto(CommandSchema) {}
export class HistoryQueryDto extends createZodDto(HistoryQuerySchema) {}
export class OperationParamsDto extends createZodDto(OperationParamsSchema) {}
export class OperationDto extends createZodDto(OperationSchema) {}
export class OperationListDto extends createZodDto(OperationListSchema) {}
export class OperationResultDto extends createZodDto(OperationResultSchema) {}
