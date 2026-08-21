import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { TenantModulesModule } from '../tenant-modules/tenant-modules.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TenantsModule, TenantModulesModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
