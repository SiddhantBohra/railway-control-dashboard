import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorSchema } from '@control/contracts';
import { logger } from './logging';

const detailsSchema = z.object({
  code: z.string(),
  message: z.string(),
  operationId: z.uuid().optional(),
});
const bodyParserErrorSchema = z.object({
  type: z.enum(['entity.too.large', 'entity.parse.failed']),
});

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = String(request.id ?? 'unknown');
    let status = exception instanceof HttpException ? exception.getStatus() : 500;
    let code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
    let message =
      status >= 500 ? 'The request could not be completed.' : 'The request was rejected.';
    let operationId: string | undefined;
    let issues: { path: string; message: string }[] | undefined;
    const parserError = bodyParserErrorSchema.safeParse(exception);
    if (parserError.success) {
      const oversized = parserError.data.type === 'entity.too.large';
      status = oversized ? 413 : 400;
      code = oversized ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON';
      message = oversized
        ? 'The request body exceeds 16 KiB.'
        : 'The request body must be valid JSON.';
    } else if (exception instanceof ZodValidationException || exception instanceof z.ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Check the request fields.';
      const error = exception instanceof z.ZodError ? exception : exception.getZodError();
      if (error instanceof z.ZodError) {
        issues = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: 'Invalid value',
        }));
      }
    } else if (exception instanceof HttpException) {
      const parsed = detailsSchema.safeParse(exception.getResponse());
      if (parsed.success) ({ code, message, operationId } = parsed.data);
    }
    logger[status >= 500 ? 'error' : 'warn']({ requestId, status, code }, 'HTTP request failed');
    response.status(status).json(
      ErrorSchema.parse({
        error: {
          code,
          message,
          requestId,
          ...(issues ? { issues } : {}),
          ...(operationId ? { operationId } : {}),
        },
      }),
    );
  }
}
