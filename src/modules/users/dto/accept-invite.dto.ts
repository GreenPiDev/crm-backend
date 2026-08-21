import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'token zorunludur'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır'),
});

export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}
