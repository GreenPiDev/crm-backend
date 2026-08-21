import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  TENANT_PRISMA,
  TenantPrismaClient,
} from '../../common/prisma/tenant-prisma.provider';
import { parseSpreadsheet } from '../../common/import/parse-file';
import { createAccountSchema } from '../accounts/dto/create-account.dto';
import { createContactSchema } from '../contacts/dto/create-contact.dto';

export interface ImportRowError {
  row: number;
  messages: string[];
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  errors: ImportRowError[];
}

export interface ImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [target, source] of Object.entries(mapping)) {
    if (!source) {
      continue;
    }
    const value = row[source];
    mapped[target] = value === '' ? undefined : value;
  }
  return mapped;
}

@Injectable()
export class ImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
  ) {}

  preview(buffer: Buffer): ImportPreview {
    const { headers, rows } = parseSpreadsheet(buffer);
    return { headers, sampleRows: rows.slice(0, 10), totalRows: rows.length };
  }

  async importAccounts(
    buffer: Buffer,
    mapping: Record<string, string>,
  ): Promise<ImportResult> {
    if (!mapping.name) {
      throw new BadRequestException("'name' alanı bir sütuna eşlenmelidir");
    }
    const { rows } = parseSpreadsheet(buffer);
    const errors: ImportRowError[] = [];
    const validRows: Record<string, unknown>[] = [];

    rows.forEach((row, index) => {
      const mapped = applyMapping(row, mapping);
      const result = createAccountSchema.safeParse(mapped);
      if (!result.success) {
        errors.push({
          row: index + 2,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        return;
      }
      validRows.push(result.data);
    });

    if (validRows.length > 0) {
      await this.tenantPrisma.account.createMany({
        // tenantId, tenant-izolasyon uzantısı tarafından çalışma zamanında eklenir
        data: validRows as never,
      });
    }

    return { totalRows: rows.length, imported: validRows.length, errors };
  }

  async importContacts(
    buffer: Buffer,
    mapping: Record<string, string>,
  ): Promise<ImportResult> {
    if (!mapping.firstName || !mapping.lastName) {
      throw new BadRequestException(
        "'firstName' ve 'lastName' alanları bir sütuna eşlenmelidir",
      );
    }
    const { rows } = parseSpreadsheet(buffer);
    const errors: ImportRowError[] = [];
    const validRows: Record<string, unknown>[] = [];

    for (const [index, row] of rows.entries()) {
      const mapped = applyMapping(row, mapping);
      const result = createContactSchema.safeParse(mapped);
      if (!result.success) {
        errors.push({
          row: index + 2,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        continue;
      }
      if (result.data.accountId) {
        const account = await this.tenantPrisma.account.findFirst({
          where: { id: result.data.accountId },
        });
        if (!account) {
          errors.push({
            row: index + 2,
            messages: [
              `accountId: firma bulunamadı (${result.data.accountId})`,
            ],
          });
          continue;
        }
      }
      validRows.push(result.data);
    }

    if (validRows.length > 0) {
      await this.tenantPrisma.contact.createMany({
        // tenantId, tenant-izolasyon uzantısı tarafından çalışma zamanında eklenir
        data: validRows as never,
      });
    }

    return { totalRows: rows.length, imported: validRows.length, errors };
  }

  async exportAccounts(): Promise<Buffer> {
    const accounts = await this.tenantPrisma.account.findMany({
      orderBy: { name: 'asc' },
    });
    const rows = accounts.map((account) => ({
      Ad: account.name,
      'Vergi No': account.taxNumber ?? '',
      'Vergi Dairesi': account.taxOffice ?? '',
      Sektör: account.sector ?? '',
      'Web Sitesi': account.website ?? '',
      Telefon: account.phone ?? '',
      'E-posta': account.email ?? '',
      Adres: account.address ?? '',
      Şehir: account.city ?? '',
    }));
    return this.toXlsxBuffer(rows, 'Firmalar');
  }

  async exportContacts(): Promise<Buffer> {
    const contacts = await this.tenantPrisma.contact.findMany({
      orderBy: { lastName: 'asc' },
      include: { account: { select: { name: true } } },
    });
    const rows = contacts.map((contact) => ({
      Ad: contact.firstName,
      Soyad: contact.lastName,
      Unvan: contact.title ?? '',
      'E-posta': contact.email ?? '',
      Telefon: contact.phone ?? '',
      Firma: contact.account?.name ?? '',
    }));
    return this.toXlsxBuffer(rows, 'Kişiler');
  }

  private toXlsxBuffer(
    rows: Record<string, string>[],
    sheetName: string,
  ): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
