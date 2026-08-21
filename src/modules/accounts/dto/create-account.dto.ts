import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isValidTaxNumber } from '../../../common/validators/tax';

export const createAccountSchema = z.object({
  name: z
    .string({ error: 'Firma adı zorunludur' })
    .min(2, 'Firma adı en az 2 karakter olmalıdır'),
  taxNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidTaxNumber(v), 'Geçersiz vergi/TC no')
    .optional(),
  taxOffice: z.string().optional(),
  sector: z.string().optional(),
  website: z.string().url('Geçersiz web adresi').optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email('Geçersiz e-posta').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  ownerId: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export class CreateAccountDto extends createZodDto(createAccountSchema) {}
