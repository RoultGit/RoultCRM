-- La tarea deja de ser un checkbox y pasa a tener tres estados, que son las columnas del tablero.
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DOING', 'DONE');

ALTER TABLE "Task" ADD COLUMN "status" "TaskStatus" NOT NULL DEFAULT 'TODO';
ALTER TABLE "Task" ADD COLUMN "dueTime" TEXT;

-- Las tareas que ya existen conservan su estado: lo marcado como hecho queda en DONE, el resto en
-- TODO. Se hace ANTES de borrar "done", si no la información se pierde.
UPDATE "Task" SET "status" = 'DONE' WHERE "done" = true;

DROP INDEX IF EXISTS "Task_tenantId_ownerId_done_idx";
ALTER TABLE "Task" DROP COLUMN "done";
CREATE INDEX "Task_tenantId_ownerId_status_idx" ON "Task"("tenantId", "ownerId", "status");
