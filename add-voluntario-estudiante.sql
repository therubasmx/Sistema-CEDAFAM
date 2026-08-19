-- Rol Voluntario/a + Tipo de trabajo "Estudiante" (reemplaza a "Becario").
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para: el valor VOLUNTEER del enum Role, el valor STUDENT del enum WorkType,
-- y la columna leave_requests.userId (+ psychologistId ahora opcional) para
-- que alguien sin perfil de psicólogo (un Voluntario) también pueda usar
-- "Solicitar permiso".
--
-- El valor 'FELLOW' del enum WorkType NO se elimina (Postgres no permite
-- quitar valores de un enum sin recrear el tipo): se migran las filas que lo
-- usaban a 'STUDENT' y el valor viejo queda sin uso, sin estorbar.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Nuevo rol: Voluntario/a
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VOLUNTEER';

-- 2) Nuevo tipo de trabajo: Estudiante
ALTER TYPE "WorkType" ADD VALUE IF NOT EXISTS 'STUDENT';

-- 3) Reclasifica a quien hoy figura como Becario ('FELLOW') como Estudiante.
--    Ejecutar solo después de que el paso 2 haya confirmado (Neon exige que
--    el ALTER TYPE anterior haya corrido en una transacción separada antes
--    de poder usar el valor nuevo).
UPDATE "psychologists" SET "workType" = 'STUDENT' WHERE "workType" = 'FELLOW';

-- 4) leave_requests: quién solicita, independiente de si tiene o no perfil
--    de psicólogo (columna nueva userId, requerida; psychologistId pasa a
--    ser opcional, solo presente para quien sí atiende pacientes).
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Rellena userId a partir del psicólogo dueño de cada solicitud existente.
UPDATE "leave_requests" lr
  SET "userId" = p."userId"
  FROM "psychologists" p
  WHERE p."id" = lr."psychologistId" AND lr."userId" IS NULL;

-- Confirma que no quedó ninguna fila sin userId antes de forzar NOT NULL.
-- Si esta consulta devuelve filas, revísalas a mano antes de continuar:
--   SELECT * FROM "leave_requests" WHERE "userId" IS NULL;

ALTER TABLE "leave_requests" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "leave_requests" ALTER COLUMN "psychologistId" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "leave_requests_userId_idx" ON "leave_requests"("userId");
