import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TENANT_PRISMA,
  TenantPrismaClient,
} from '../../common/prisma/tenant-prisma.provider';
import { parseSort } from '../../common/dto/list-query.dto';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import type { ContactQueryDto } from './dto/contact-query.dto';

const SORTABLE_FIELDS = ['lastName', 'firstName', 'createdAt'] as const;

function normalize<T extends object>(dto: T): T {
  const result = { ...dto } as Record<string, unknown>;
  if ('email' in result && result.email === '') {
    result.email = null;
  }
  return result as T;
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
  ) {}

  async list(query: ContactQueryDto) {
    const { page, pageSize, q, accountId, ownerId } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'lastName',
      direction: 'asc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.tenantPrisma.contact.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: { account: { select: { id: true, name: true } } },
      }),
      this.tenantPrisma.contact.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const contact = await this.tenantPrisma.contact.findFirst({
      where: { id },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!contact) {
      throw new NotFoundException('Kişi bulunamadı');
    }
    return contact;
  }

  private async assertAccountExists(accountId: string | undefined) {
    if (!accountId) {
      return;
    }
    const account = await this.tenantPrisma.account.findFirst({
      where: { id: accountId },
    });
    if (!account) {
      throw new BadRequestException('Belirtilen firma bulunamadı');
    }
  }

  async create(dto: CreateContactDto) {
    await this.assertAccountExists(dto.accountId);
    return this.tenantPrisma.contact.create({
      // tenantId, tenant-izolasyon uzantısı tarafından çalışma zamanında eklenir
      data: normalize(dto) as never,
    });
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.findOne(id);
    await this.assertAccountExists(dto.accountId);
    return this.tenantPrisma.contact.update({
      where: { id },
      data: normalize(dto),
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tenantPrisma.contact.delete({ where: { id } });
  }
}
