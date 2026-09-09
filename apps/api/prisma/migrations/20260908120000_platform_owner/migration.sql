-- Dueño de la plataforma: quien da de alta las empresas cliente. Arranca en false para todos; se
-- marca a mano al dueño real. Que el default sea false importa: si fuera true, cada admin de cada
-- empresa cliente podría crear entidades y ver la lista de todos los demás clientes.
ALTER TABLE "User" ADD COLUMN "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false;
