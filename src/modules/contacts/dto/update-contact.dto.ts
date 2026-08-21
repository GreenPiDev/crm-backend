import { createZodDto } from 'nestjs-zod';
import { createContactSchema } from './create-contact.dto';

export const updateContactSchema = createContactSchema.partial();

export class UpdateContactDto extends createZodDto(updateContactSchema) {}
