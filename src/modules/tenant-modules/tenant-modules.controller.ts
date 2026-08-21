import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantModulesService } from './tenant-modules.service';
import { UpdateTenantModuleDto } from './dto/update-tenant-module.dto';

@Controller('tenant-modules')
export class TenantModulesController {
  constructor(private readonly tenantModulesService: TenantModulesService) {}

  @Get()
  list() {
    return this.tenantModulesService.list();
  }

  @Roles('OWNER')
  @Patch(':key')
  toggle(@Param('key') key: string, @Body() dto: UpdateTenantModuleDto) {
    return this.tenantModulesService.toggle(key, dto.enabled);
  }
}
