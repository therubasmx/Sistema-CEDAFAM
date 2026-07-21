-- Detección de expediente existente al recibir una solicitud del formulario
-- público. Cambio de esquema aditivo y no destructivo. Equivale a
-- `prisma db push` para las adiciones de: el enum PatientIntakeMatchStatus,
-- el valor PATIENT_MATCH_REVIEW de NotificationType, y la tabla
-- patient_intake_matches.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Estado de la revisión de match
DO $$ BEGIN
  CREATE TYPE "PatientIntakeMatchStatus" AS ENUM ('PENDING', 'APPLIED', 'CREATED_NEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Nuevo tipo de notificación
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PATIENT_MATCH_REVIEW';

-- 3) Tabla de matches pendientes de revisión
CREATE TABLE IF NOT EXISTS "patient_intake_matches" (
  "id"               TEXT NOT NULL,
  "submittedData"    JSONB NOT NULL,
  "matchedPatientId" TEXT NOT NULL,
  "matchedByField"   TEXT NOT NULL,
  "status"           "PatientIntakeMatchStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedById"     TEXT,
  "resolvedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_intake_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "patient_intake_matches_status_idx"
  ON "patient_intake_matches"("status");
CREATE INDEX IF NOT EXISTS "patient_intake_matches_matchedPatientId_idx"
  ON "patient_intake_matches"("matchedPatientId");

DO $$ BEGIN
  ALTER TABLE "patient_intake_matches"
    ADD CONSTRAINT "patient_intake_matches_matchedPatientId_fkey"
    FOREIGN KEY ("matchedPatientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_intake_matches"
    ADD CONSTRAINT "patient_intake_matches_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
