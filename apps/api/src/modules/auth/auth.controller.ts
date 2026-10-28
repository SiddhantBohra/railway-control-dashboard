import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { LoginSchema, SessionSchema } from '@control/contracts';
import { LocalGuard } from './local.guard';
import { EmptyDto } from '../resources/dto/resources.dto';
import { ApiErrors, CsrfHeader } from '../../common/api-docs';
import { ApiException } from '../../common/api-error';
import { NoQuery } from '../../common/no-query.decorator';

class LoginDto extends createZodDto(LoginSchema) {}
class SessionDto extends createZodDto(SessionSchema) {}

function currentSession(request: Request) {
  request.session.csrfToken ??= randomBytes(32).toString('hex');
  const authenticated =
    request.isAuthenticated() &&
    !!request.session.authenticatedAt &&
    Date.now() - request.session.authenticatedAt <= 8 * 3600000;
  return {
    authenticated,
    username: authenticated ? (request.user?.subject ?? null) : null,
    csrfToken: request.session.csrfToken,
  };
}

@ApiTags('auth')
@ApiErrors(400, 403, 429, 503)
@Controller('api/v1/auth')
export class AuthController {
  @Get('session')
  @ZodResponse({ type: SessionDto })
  get(@Req() request: Request, @NoQuery() _query: unknown) {
    return currentSession(request);
  }

  @Post('login')
  @CsrfHeader()
  @ApiErrors(401)
  @UseGuards(LocalGuard)
  @ZodResponse({ type: SessionDto, status: 200 })
  async login(@Req() request: Request, @Body() _body: LoginDto, @NoQuery() _query: unknown) {
    const user = request.user;
    if (!user)
      throw new ApiException(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
    // Passport's session login regenerates the session ID (fixation protection).
    await new Promise<void>((resolve, reject) =>
      request.logIn(user, (error: unknown) => (error ? reject(error) : resolve())),
    );
    request.session.authenticatedAt = Date.now();
    const result = currentSession(request);
    await new Promise<void>((resolve, reject) =>
      request.session.save((error: unknown) => (error ? reject(error) : resolve())),
    );
    return result;
  }

  @Post('logout')
  @CsrfHeader()
  @ZodResponse({ type: SessionDto, status: 200 })
  async logout(@Req() request: Request, @Body() _body: EmptyDto, @NoQuery() _query: unknown) {
    await new Promise<void>((resolve, reject) =>
      request.logOut((error: unknown) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((error: unknown) => (error ? reject(error) : resolve())),
    );
    return currentSession(request);
  }
}
