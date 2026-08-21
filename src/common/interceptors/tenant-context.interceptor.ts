import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from '../tenant/tenant-context';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      TenantContext.run(
        { tenantId: user.tenantId, userId: user.id, role: user.role },
        () => {
          next.handle().subscribe(subscriber);
        },
      );
    });
  }
}
