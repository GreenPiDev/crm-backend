import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  TENANT_PRISMA,
  TenantPrismaClient,
} from '../../common/prisma/tenant-prisma.provider';
import { parseSort } from '../../common/dto/list-query.dto';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';
import type { AccountQueryDto } from './dto/account-query.dto';

const SORTABLE_FIELDS = ['name', 'city', 'createdAt'] as const;

function normalize<T extends object>(dto: T): T {
  const result = { ...dto } as Record<string, unknown>;
  for (const key of ['website', 'email', 'taxNumber']) {
    if (key in result && result[key] === '') {
      result[key] = null;
    }
  }
  return result as T;
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
  ) {}

  async list(query: AccountQueryDto) {
    const { page, pageSize, q, city, sector, ownerId } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(city ? { city } : {}),
      ...(sector ? { sector } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.tenantPrisma.account.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.tenantPrisma.account.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const account = await this.tenantPrisma.account.findFirst({
      where: { id },
      include: { contacts: true },
    });
    if (!account) {
      throw new NotFoundException('Firma bulunamadı');
    }
    return account;
  }

  create(dto: CreateAccountDto) {
    return this.tenantPrisma.account.create({
      // tenantId, tenant-izolasyon uzantısı tarafından çalışma zamanında eklenir
      data: normalize(dto) as never,
    });
  }

  async update(id: string, dto: UpdateAccountDto) {
    await this.findOne(id);
    return this.tenantPrisma.account.update({
      where: { id },
      data: normalize(dto),
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tenantPrisma.account.delete({ where: { id } });
  }
}
