import { Provider } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { tenantExtension } from './tenant.extension';

export const TENANT_PRISMA = 'TENANT_PRISMA';

function extend(prisma: PrismaService) {
  return prisma.$extends(tenantExtension());
}

export type TenantPrismaClient = ReturnType<typeof extend>;

export const tenantPrismaProvider: Provider = {
  provide: TENANT_PRISMA,
  useFactory: extend,
  inject: [PrismaService],
};
