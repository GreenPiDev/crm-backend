import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'SALES', 'VIEWER']),
});

export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
