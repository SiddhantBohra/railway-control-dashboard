import { createZodDto } from 'nestjs-zod';
import {
  EmptySchema,
  ResourceListSchema,
  ResourceParamsSchema,
  ResourceSchema,
} from '@control/contracts';

export class ResourceParamsDto extends createZodDto(ResourceParamsSchema) {}
export class ResourceDto extends createZodDto(ResourceSchema) {}
export class ResourceListDto extends createZodDto(ResourceListSchema) {}
export class EmptyDto extends createZodDto(EmptySchema) {}
