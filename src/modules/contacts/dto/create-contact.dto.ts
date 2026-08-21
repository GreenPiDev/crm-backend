import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createContactSchema = z.object({
  firstName: z.string({ error: 'Ad zorunludur' }).min(1, 'Ad zorunludur'),
  lastName: z.string({ error: 'Soyad zorunludur' }).min(1, 'Soyad zorunludur'),
  accountId: z.string().optional(),
  title: z.string().optional(),
  email: z.string().email('Geçersiz e-posta').optional().or(z.literal('')),
  phone: z.string().optional(),
  ownerId: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export class CreateContactDto extends createZodDto(createContactSchema) {}
