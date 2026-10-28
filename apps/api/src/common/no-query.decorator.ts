import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { EmptySchema } from '@control/contracts';

// Empty query objects have no OpenAPI parameters. A custom parameter decorator keeps
// strict runtime validation without making nestjs-zod invent a root query parameter.
export const NoQuery = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return EmptySchema.parse(context.switchToHttp().getRequest<Request>().query);
});
