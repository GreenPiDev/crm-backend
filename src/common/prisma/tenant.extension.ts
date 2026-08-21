import { Prisma } from '@prisma/client';
import { TenantContext } from '../tenant/tenant-context';

/**
 * Tenant izolasyonunu zorunlu kılan Prisma uzantısı.
 * Tenant bağlamı yoksa sorgu sessizce tüm kiracıları döndürmek yerine hata fırlatır.
 */
const TENANT_EXCLUDED_MODELS = new Set(['Tenant']);

// deletedAt alanı olan modeller: okuma sorgularında silinmişler otomatik
// gizlenir, delete/deleteMany çağrıları update'e çevrilerek yumuşak silinir.
const SOFT_DELETE_MODELS = new Set(['Account', 'Contact']);

const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const WHERE_WRITE_OPS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

export function tenantExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'tenant-isolation',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || TENANT_EXCLUDED_MODELS.has(model)) {
              return query(args);
            }

            const tenantId = TenantContext.getTenantId();
            if (!tenantId) {
              throw new Error(
                `Kiracı bağlamı yok: ${model}.${operation} sorgusu tenantId olmadan çalıştırılamaz`,
              );
            }

            const typedArgs = args as Record<string, unknown>;
            const isSoftDelete = SOFT_DELETE_MODELS.has(model);

            if (
              isSoftDelete &&
              (operation === 'delete' || operation === 'deleteMany')
            ) {
              const where = { ...(typedArgs.where as object), tenantId };
              const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
              const modelClient = (
                client as unknown as Record<
                  string,
                  {
                    update: (args: unknown) => Promise<unknown>;
                    updateMany: (args: unknown) => Promise<unknown>;
                  }
                >
              )[modelKey];
              if (operation === 'delete') {
                return modelClient.update({
                  where,
                  data: { deletedAt: new Date() },
                });
              }
              return modelClient.updateMany({
                where,
                data: { deletedAt: new Date() },
              });
            }

            if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
              const where = {
                ...(typedArgs.where as object),
                tenantId,
              } as Record<string, unknown>;
              if (
                isSoftDelete &&
                READ_OPS.has(operation) &&
                where.deletedAt === undefined
              ) {
                where.deletedAt = null;
              }
              typedArgs.where = where;
            } else if (
              operation === 'findUnique' ||
              operation === 'findUniqueOrThrow'
            ) {
              typedArgs.where = { ...(typedArgs.where as object), tenantId };
            } else if (operation === 'create') {
              typedArgs.data = { ...(typedArgs.data as object), tenantId };
            } else if (operation === 'createMany') {
              const data = typedArgs.data;
              if (Array.isArray(data)) {
                typedArgs.data = data.map((item) => ({ ...item, tenantId }));
              }
            } else if (operation === 'upsert') {
              typedArgs.where = { ...(typedArgs.where as object), tenantId };
              typedArgs.create = { ...(typedArgs.create as object), tenantId };
            }

            return query(typedArgs as never);
          },
        },
      },
    }),
  );
}
