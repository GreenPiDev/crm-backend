import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const inviteUserSchema = z.object({
  email: z.string().email('Geçersiz e-posta'),
  fullName: z.string().min(2, 'Ad soyad en az 2 karakter olmalıdır'),
  role: z.enum(['ADMIN', 'SALES', 'VIEWER']),
});

export class InviteUserDto extends createZodDto(inviteUserSchema) {}
