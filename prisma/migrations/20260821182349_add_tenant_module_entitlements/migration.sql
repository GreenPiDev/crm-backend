-- CreateTable
CREATE TABLE "TenantModuleEntitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModuleEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantModuleEntitlement_tenantId_idx" ON "TenantModuleEntitlement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantModuleEntitlement_tenantId_moduleKey_key" ON "TenantModuleEntitlement"("tenantId", "moduleKey");

-- AddForeignKey
ALTER TABLE "TenantModuleEntitlement" ADD CONSTRAINT "TenantModuleEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
