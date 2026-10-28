import { applyDecorators } from '@nestjs/common';
import { ApiResponse, ApiCookieAuth, ApiHeader } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ErrorSchema } from '@control/contracts';

export class ErrorDto extends createZodDto(ErrorSchema) {}

export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        type: ErrorDto.Output,
        description:
          (
            {
              400: 'Invalid request',
              401: 'Authentication required',
              403: 'Forbidden or invalid CSRF/origin',
              404: 'Not found in authorized scope',
              409: 'Idempotency conflict, resource busy or reconciliation unavailable',
              429: 'Rate limited; see Retry-After',
              503: 'Dependency unavailable',
            } as Record<number, string>
          )[status] ?? 'Request failed',
      }),
    ),
  );
}
export function ProtectedApi() {
  return applyDecorators(ApiCookieAuth('session'), ApiErrors(401, 403, 429, 503));
}
export function CsrfHeader() {
  return ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Session-bound token from GET /api/v1/auth/session',
  });
}
