import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  TENANT_PRISMA,
  TenantPrismaClient,
} from '../../common/prisma/tenant-prisma.provider';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  MODULE_CATALOG,
  MODULE_KEYS,
  ModuleKey,
  isModuleKey,
} from '../../common/modules-catalog/module-catalog';

export interface TenantModuleStatus {
  key: ModuleKey;
  label: string;
  enabled: boolean;
}

@Injectable()
export class TenantModulesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
  ) {}

  async seedDefaultsForNewTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await tx.tenantModuleEntitlement.createMany({
      data: MODULE_KEYS.map((moduleKey) => ({
        tenantId,
        moduleKey,
        enabled: true,
      })),
    });
  }

  async getEnabledModuleKeys(): Promise<ModuleKey[]> {
    const rows = await this.tenantPrisma.tenantModuleEntitlement.findMany();
    const enabledFromDb = new Set(
      rows.filter((r) => r.enabled).map((r) => r.moduleKey),
    );
    const seededKeys = new Set(rows.map((r) => r.moduleKey));
    // DB'de hiç satırı olmayan kataloğa yeni eklenmiş bir modül, o kiracı için
    // henüz seed edilmemiş olsa da varsayılan olarak açık kabul edilir.
    return MODULE_KEYS.filter(
      (key) => enabledFromDb.has(key) || !seededKeys.has(key),
    );
  }

  async list(): Promise<TenantModuleStatus[]> {
    const rows = await this.tenantPrisma.tenantModuleEntitlement.findMany();
    const byKey = new Map(rows.map((r) => [r.moduleKey, r.enabled]));
    return MODULE_CATALOG.map(({ key, label }) => ({
      key,
      label,
      enabled: byKey.get(key) ?? true,
    }));
  }

  async toggle(
    moduleKey: string,
    enabled: boolean,
  ): Promise<TenantModuleStatus> {
    if (!isModuleKey(moduleKey)) {
      throw new BadRequestException('Geçersiz modül anahtarı');
    }

    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Kiracı bağlamı yok');
    }

    await this.tenantPrisma.tenantModuleEntitlement.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      update: { enabled },
      create: { tenantId, moduleKey, enabled },
    });

    const catalogEntry = MODULE_CATALOG.find((m) => m.key === moduleKey);
    return { key: moduleKey, label: catalogEntry!.label, enabled };
  }
}
