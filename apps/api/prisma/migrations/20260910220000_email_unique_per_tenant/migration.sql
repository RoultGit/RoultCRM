-- El correo pasa a ser único POR EMPRESA, no en el mundo entero.
--
-- Con el índice global, una persona pertenecía a una sola empresa: un contador que atiende a dos
-- clientes no podía usar su correo en las dos, y el dueño con dos negocios necesitaba dos casillas.
-- Para un producto que se vende a varias empresas, esa es la restricción que impide crecer.
--
-- No hace falta migrar datos: pasar de un índice más estricto a uno más laxo nunca puede chocar con
-- filas existentes.
DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- El login busca por correo antes de saber de qué empresa es, así que necesita su propio índice:
-- sin él, cada intento de ingreso recorre la tabla entera.
CREATE INDEX "User_email_idx" ON "User"("email");
