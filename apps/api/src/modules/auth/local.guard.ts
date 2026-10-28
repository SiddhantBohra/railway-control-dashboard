import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { LoginSchema } from '@control/contracts';

@Injectable()
export class LocalGuard extends AuthGuard('local') {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // Guards precede DTO pipes in Nest. Validate before Passport reads credentials.
    const body: unknown = request.body;
    request.body = LoginSchema.parse(body);
    return super.canActivate(context);
  }
}
