import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../../common/api-error';

export function subject(request: Request): string {
  if (
    !request.isAuthenticated() ||
    !request.user?.subject ||
    !request.session.authenticatedAt ||
    Date.now() - request.session.authenticatedAt > 8 * 3600000
  ) {
    throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
  }
  return request.user.subject;
}

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    subject(context.switchToHttp().getRequest<Request>());
    return true;
  }
}
