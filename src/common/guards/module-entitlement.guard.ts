import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import type { ModuleKey } from '../modules-catalog/module-catalog';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class ModuleEntitlementGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModules = this.reflector.getAllAndOverride<ModuleKey[]>(
      MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const hasAccess = requiredModules.some((key) =>
      user.enabledModules.includes(key),
    );
    if (!hasAccess) {
      throw new ForbiddenException('Bu modül kiracınız için etkin değil');
    }
    return true;
  }
}
