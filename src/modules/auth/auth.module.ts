import { Module } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: seconds(60),
        // Test ortamında e2e testleri tek dakika içinde onlarca kayıt/giriş
        // isteği atıyor; gerçek hız sınırı yalnızca dev/prod'da uygulanır.
        limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
})
export class AuthModule {}
