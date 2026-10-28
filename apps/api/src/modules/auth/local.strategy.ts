import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy, PassportSerializer } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { verify } from 'argon2';
import { Config } from '../../config/config';
import { ApiException } from '../../common/api-error';
import { z } from 'zod';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(Config) private readonly config: Config) {
    super();
  }
  async validate(username: string, password: string): Promise<Express.User> {
    const valid = await verify(this.config.values.DEMO_PASSWORD_HASH, password);
    if (username !== this.config.values.DEMO_USERNAME || !valid)
      throw new ApiException(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.');
    return { subject: this.config.values.DEMO_USERNAME };
  }
}

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(@Inject(Config) private readonly config: Config) {
    super();
  }
  override serializeUser(user: Express.User, done: (error: Error | null, value?: string) => void) {
    done(null, user.subject);
  }
  override deserializeUser(
    input: unknown,
    done: (error: Error | null, value?: Express.User | false) => void,
  ) {
    const parsed = z.literal(this.config.values.DEMO_USERNAME).safeParse(input);
    done(null, parsed.success ? { subject: parsed.data } : false);
  }
}
