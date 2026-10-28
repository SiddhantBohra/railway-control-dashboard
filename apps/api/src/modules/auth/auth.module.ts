import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { LocalStrategy, SessionSerializer } from './local.strategy';
import { SessionGuard } from './session.guard';

@Global()
@Module({
  imports: [PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [LocalStrategy, SessionSerializer, SessionGuard],
  exports: [SessionGuard],
})
export class AuthModule {}
