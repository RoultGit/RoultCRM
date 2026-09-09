-- Contraseña provisoria pendiente de cambiar. Default false: las cuentas que ya existen tienen
-- contraseñas que sus dueños eligieron o ya conocen, y forzarlas a todas sería sacar a todo el
-- mundo de la app de golpe. Se marca a mano lo que corresponda.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
