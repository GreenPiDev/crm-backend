import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '../modules-catalog/module-catalog';

export const MODULE_KEY = 'requiresModule';
export const RequiresModule = (...moduleKeys: ModuleKey[]) =>
  SetMetadata(MODULE_KEY, moduleKeys);
