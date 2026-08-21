import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifre zorunludur'),
  newPassword: z.string().min(8, 'Yeni şifre en az 8 karakter olmalıdır'),
});

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
