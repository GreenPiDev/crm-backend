import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { listQuerySchema } from '../../../common/dto/list-query.dto';

export const contactQuerySchema = listQuerySchema.extend({
  accountId: z.string().optional(),
  ownerId: z.string().optional(),
});

export class ContactQueryDto extends createZodDto(contactQuerySchema) {}
