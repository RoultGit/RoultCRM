-- Prioridad. Todo lo que ya existe queda en MEDIUM: es lo neutro, y asignarle otra a ciegas
-- sería inventar una urgencia que nadie declaró.
CREATE TYPE "TaskPriority" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW');
ALTER TABLE "Task" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';

-- Autoría y cierre. createdById queda NULL en las tareas viejas a propósito: no se sabe quién las
-- creó y rellenarlo con el dueño sería afirmar algo que no consta.
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN "completedById" TEXT;
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "Task_tenantId_completedById_idx" ON "Task"("tenantId", "completedById");
