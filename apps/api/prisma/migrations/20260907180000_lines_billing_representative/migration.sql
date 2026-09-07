-- Dos líneas de negocio nuevas. ADD VALUE y no un tipo nuevo: no toca las filas existentes, así que
-- ninguna empresa ni lead cambia de línea al migrar.
ALTER TYPE "Line" ADD VALUE IF NOT EXISTS 'AUTOMATIZACION';
ALTER TYPE "Line" ADD VALUE IF NOT EXISTS 'SERVICIO';

-- Pago único vs suscripción mensual. Todo lo que ya existe queda como pago único, que es lo que
-- era hasta hoy: nada cambia de significado retroactivamente.
CREATE TYPE "BillingType" AS ENUM ('ONE_TIME', 'MONTHLY');
ALTER TABLE "Lead" ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME';
ALTER TABLE "Deal" ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME';

-- Representante legal. Nullable: las fichas que ya existen no lo tienen y no hay de dónde sacarlo.
ALTER TABLE "Company" ADD COLUMN "representativeName" TEXT;
ALTER TABLE "Lead" ADD COLUMN "representativeName" TEXT;
