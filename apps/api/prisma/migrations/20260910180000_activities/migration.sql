-- CONTACT como cuarto tipo relacionable: una interacción también se registra contra una persona,
-- no solo contra la empresa.
ALTER TYPE "RelatedType" ADD VALUE IF NOT EXISTS 'CONTACT';

-- Qué pasó con un cliente. Sin esto el CRM sabe QUIÉN es el cliente pero no QUÉ pasó con él, y esa
-- historia vive en la cabeza del vendedor: cuando se va, la empresa la pierde.
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'MEETING', 'WHATSAPP', 'EMAIL', 'VISIT');

CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "relatedType" "RelatedType" NOT NULL,
    "relatedId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Activity_tenantId_relatedType_relatedId_occurredAt_idx"
  ON "Activity"("tenantId", "relatedType", "relatedId", "occurredAt");
