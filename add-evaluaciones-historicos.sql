-- Folios históricos de evaluación (100–205, del Excel del centro).
--
-- Ajusta `evaluation_folios` para que cargue con las dos formas del registro:
-- los folios nuevos (paciente y evaluador del sistema, diagnóstico, rango de
-- fechas) y los del registro en papel, donde el paciente o el evaluador puede
-- no existir como usuario, no hay diagnóstico y la fecha viene en texto libre.
--
-- Corre DESPUÉS de add-evaluaciones.sql. Es no destructivo, pero relaja
-- restricciones NOT NULL: aplícalo antes de importar los históricos.
--
-- Ejecutar en el SQL Editor de Neon.

-- 1) Copia en texto de lo que dice el registro. Es lo que se muestra en el
--    módulo, exista o no el paciente/evaluador ligado.
ALTER TABLE "evaluation_folios"
  ADD COLUMN IF NOT EXISTS "patientName"   TEXT,
  ADD COLUMN IF NOT EXISTS "fileNumber"    TEXT,
  ADD COLUMN IF NOT EXISTS "evaluatorName" TEXT,
  ADD COLUMN IF NOT EXISTS "evaluationDateText" TEXT,
  ADD COLUMN IF NOT EXISTS "isHistorical"  BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Rellena la copia en texto de los folios que ya existieran, para poder
--    ponerla NOT NULL sin perder filas. (Hoy la tabla está vacía; esto es por
--    si se corre sobre una base donde ya se capturó algo.)
UPDATE "evaluation_folios" f
SET "patientName"   = COALESCE(f."patientName", p."fullName", 'Sin nombre'),
    "fileNumber"    = COALESCE(f."fileNumber", p."fileNumber"),
    "evaluatorName" = COALESCE(f."evaluatorName", u."name", 'Sin evaluador')
FROM "patients" p, "users" u
WHERE p."id" = f."patientId" AND u."id" = f."evaluatorId"
  AND (f."patientName" IS NULL OR f."evaluatorName" IS NULL);

UPDATE "evaluation_folios"
SET "patientName"   = COALESCE("patientName", 'Sin nombre'),
    "evaluatorName" = COALESCE("evaluatorName", 'Sin evaluador')
WHERE "patientName" IS NULL OR "evaluatorName" IS NULL;

ALTER TABLE "evaluation_folios"
  ALTER COLUMN "patientName"   SET NOT NULL,
  ALTER COLUMN "evaluatorName" SET NOT NULL;

-- 3) En el registro en papel el paciente o el evaluador puede no existir como
--    registro del sistema, y no hay diagnóstico ni fechas capturables.
ALTER TABLE "evaluation_folios"
  ALTER COLUMN "patientId"         DROP NOT NULL,
  ALTER COLUMN "evaluatorId"       DROP NOT NULL,
  ALTER COLUMN "diagnosis"         DROP NOT NULL,
  ALTER COLUMN "firstInterviewAt"  DROP NOT NULL,
  ALTER COLUMN "resultsDeliveryAt" DROP NOT NULL;

-- 4) Borrar un paciente o un usuario ya no puede llevarse el folio: el folio
--    es el registro del centro y sobrevive con su copia en texto.
ALTER TABLE "evaluation_folios"
  DROP CONSTRAINT IF EXISTS "evaluation_folios_patientId_fkey";
ALTER TABLE "evaluation_folios"
  ADD CONSTRAINT "evaluation_folios_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluation_folios"
  DROP CONSTRAINT IF EXISTS "evaluation_folios_evaluatorId_fkey";
ALTER TABLE "evaluation_folios"
  ADD CONSTRAINT "evaluation_folios_evaluatorId_fkey"
  FOREIGN KEY ("evaluatorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Un paciente puede arrastrar folios históricos y aun así recibir uno nuevo
--    si se reevalúa, así que el índice único total estorba. Lo que sí sigue
--    valiendo es "un folio NUEVO por paciente", que es justo lo que expresa un
--    índice parcial.
DROP INDEX IF EXISTS "evaluation_folios_patientId_key";
CREATE INDEX IF NOT EXISTS "evaluation_folios_patientId_idx"
  ON "evaluation_folios"("patientId");
CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_folios_patientId_current_key"
  ON "evaluation_folios"("patientId")
  WHERE "isHistorical" = FALSE AND "patientId" IS NOT NULL;
