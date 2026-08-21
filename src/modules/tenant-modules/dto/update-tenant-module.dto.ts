import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateTenantModuleSchema = z.object({
  enabled: z.boolean({ error: 'enabled alanı zorunludur' }),
});

export class UpdateTenantModuleDto extends createZodDto(
  updateTenantModuleSchema,
) {}
