-- Porcentaje de avance de la tarea. Arranca en 0: lo que ya existe no tiene avance registrado, y
-- suponerle uno sería inventar datos.
ALTER TABLE "Task" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;

-- Barrera en la base además de la del schema: si algún día entra un write por fuera de la app,
-- un -20 o un 500 romperían la barra de progreso sin que nada avise.
ALTER TABLE "Task" ADD CONSTRAINT "Task_progress_range" CHECK ("progress" >= 0 AND "progress" <= 100);
