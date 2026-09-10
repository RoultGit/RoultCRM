-- Campos que cada empresa define para sí misma. Una inmobiliaria necesita "metros cuadrados", una
-- clínica "número de historia clínica": no hay forma de anticiparlos, y agregarlos como columnas
-- obligaría a migrar la base por cada cliente nuevo.
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX');

CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" "RelatedType" NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "entity" "RelatedType" NOT NULL,
    "recordId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomField_tenantId_entity_archivedAt_idx" ON "CustomField"("tenantId", "entity", "archivedAt");
CREATE INDEX "CustomFieldValue_tenantId_entity_recordId_idx" ON "CustomFieldValue"("tenantId", "entity", "recordId");
-- Un valor por campo y por ficha: sin esto, guardar dos veces deja dos filas y la lectura tendría
-- que elegir una al azar.
CREATE UNIQUE INDEX "CustomFieldValue_fieldId_recordId_key" ON "CustomFieldValue"("fieldId", "recordId");

ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- CASCADE: si el campo se borra de verdad, sus valores no tienen a qué referirse. El uso normal es
-- archivarlo, que conserva todo.
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
