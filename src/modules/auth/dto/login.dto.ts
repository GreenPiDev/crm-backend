import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Geçersiz e-posta'),
  password: z.string().min(1, 'Şifre zorunludur'),
});

export class LoginDto extends createZodDto(loginSchema) {}
