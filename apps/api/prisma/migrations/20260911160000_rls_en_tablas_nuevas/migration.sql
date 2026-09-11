-- RLS en las tablas que se crearon después del endurecimiento inicial.
--
-- La app no usa las librerías cliente de Supabase: entra por Prisma con el rol dueño, que salta RLS.
-- Los roles `anon` y `authenticated` ya tienen revocado todo permiso, así que esto es la segunda
-- traba y no la primera; sin ella, alcanzaría con que alguien re-otorgue un GRANT por la consola
-- —o que Supabase agregue uno por defecto en una tabla nueva— para dejar los tokens de WhatsApp y
-- los de reseteo de contraseña al alcance de la clave pública.
--
-- Sin políticas a propósito: RLS activo y cero políticas = nadie más que el dueño ve nada.
ALTER TABLE "TaskUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomFieldValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppAccount" ENABLE ROW LEVEL SECURITY;

-- El REVOKE va dentro de un guard porque estos roles solo existen en Supabase: en el Postgres de
-- desarrollo y en el de las pruebas la migración tiene que pasar igual.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
  END IF;
END $$;
