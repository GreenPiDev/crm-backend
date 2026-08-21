import { Module } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 10 }])],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
})
export class AuthModule {}
