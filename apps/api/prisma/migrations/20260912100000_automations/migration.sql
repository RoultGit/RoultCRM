CREATE TYPE "AutomationCode" AS ENUM ('DEAL_STALE', 'DEAL_STAGE_TASK_PROPUESTA', 'DEAL_STAGE_TASK_ENTREGADO', 'LEAD_AUTO_ASSIGN', 'LEAD_UNTOUCHED', 'TASK_OVERDUE_ESCALATE');

CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" "AutomationCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Automation_tenantId_code_key" ON "Automation"("tenantId", "code");
CREATE INDEX "Automation_tenantId_enabled_idx" ON "Automation"("tenantId", "enabled");

CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" "AutomationCode" NOT NULL,
    "targetType" "RelatedType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRun_tenantId_code_targetId_idx" ON "AutomationRun"("tenantId", "code", "targetId");
CREATE INDEX "AutomationRun_tenantId_createdAt_idx" ON "AutomationRun"("tenantId", "createdAt");

-- Mismo criterio que el resto: la app entra con el rol dueño, que salta RLS. Activo y sin
-- políticas = nadie más que el dueño ve nada.
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
