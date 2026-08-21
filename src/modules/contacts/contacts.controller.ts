import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';

@RequiresModule('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  list(@Query() query: ContactQueryDto) {
    return this.contactsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post()
  create(@Body() dto: CreateContactDto) {
    return this.contactsService.create(dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.contactsService.remove(id);
  }
}
