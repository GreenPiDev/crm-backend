import { createZodDto } from 'nestjs-zod';
import { createAccountSchema } from './create-account.dto';

export const updateAccountSchema = createAccountSchema.partial();

export class UpdateAccountDto extends createZodDto(updateAccountSchema) {}
