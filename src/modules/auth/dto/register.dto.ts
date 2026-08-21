import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerSchema = z.object({
  tenantName: z.string().min(2, 'Firma adı en az 2 karakter olmalıdır'),
  fullName: z.string().min(2, 'Ad soyad en az 2 karakter olmalıdır'),
  email: z.string().email('Geçersiz e-posta'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır'),
});

export class RegisterDto extends createZodDto(registerSchema) {}
