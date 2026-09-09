-- Historial de avances de una tarea. El progreso deja de ser un número que alguien pisa y pasa a
-- tener historia: quién movió la aguja, cuándo y por qué.
CREATE TABLE "TaskUpdate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskUpdate_tenantId_taskId_createdAt_idx" ON "TaskUpdate"("tenantId", "taskId", "createdAt");

-- ON DELETE CASCADE: si la tarea se va, su historial no tiene a qué colgarse. Distinto de la
-- auditoría, que sobrevive a propósito porque su razón de ser es justamente que algo desapareció.
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mismo rango que Task.progress: la barra se rompe en silencio con un -20 o un 500.
ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_progress_range" CHECK ("progress" >= 0 AND "progress" <= 100);
