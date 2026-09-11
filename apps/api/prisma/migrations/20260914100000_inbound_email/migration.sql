ALTER TABLE "Tenant" ADD COLUMN "inboundKey" TEXT;
CREATE UNIQUE INDEX "Tenant_inboundKey_key" ON "Tenant"("inboundKey");

ALTER TABLE "Activity" ADD COLUMN "externalId" TEXT;
-- Postgres deja repetir NULL en un índice único, así que esto solo restringe lo que SÍ trae id
-- externo, que es justo lo que hay que deduplicar.
CREATE UNIQUE INDEX "Activity_tenantId_externalId_key" ON "Activity"("tenantId", "externalId");
