import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string;
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

export const TenantContext = {
  run<T>(store: TenantStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): TenantStore | undefined {
    return storage.getStore();
  },
  getTenantId(): string | undefined {
    return storage.getStore()?.tenantId;
  },
};
