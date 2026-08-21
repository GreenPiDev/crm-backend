import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { listQuerySchema } from '../../../common/dto/list-query.dto';

export const accountQuerySchema = listQuerySchema.extend({
  city: z.string().optional(),
  sector: z.string().optional(),
  ownerId: z.string().optional(),
});

export class AccountQueryDto extends createZodDto(accountQuerySchema) {}
