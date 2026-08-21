import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: AuthenticatedUser['role'];
  email: string;
  enabledModules: AuthenticatedUser['enabledModules'];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Kimlik doğrulama gerekli');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        },
      );
      request.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
        enabledModules: payload.enabledModules,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Kimlik doğrulama gerekli');
    }
  }

  private extractToken(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
