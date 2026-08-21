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
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountQueryDto } from './dto/account-query.dto';

@RequiresModule('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  list(@Query() query: AccountQueryDto) {
    return this.accountsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }

  @Roles('OWNER', 'ADMIN', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.accountsService.remove(id);
  }
}
