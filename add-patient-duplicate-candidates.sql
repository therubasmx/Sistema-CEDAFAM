-- Detección retroactiva de expedientes duplicados entre pacientes YA
-- existentes (a diferencia de patient_intake_matches, que solo detecta
-- duplicados al llegar una solicitud nueva del formulario público). Cambio de
-- esquema aditivo y no destructivo. Equivale a `prisma db push` para: el enum
-- PatientDuplicateCandidateStatus y la tabla patient_duplicate_candidates.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Estado de la revisión de duplicado
DO $$ BEGIN
  CREATE TYPE "PatientDuplicateCandidateStatus" AS ENUM ('PENDING', 'MERGED', 'NOT_DUPLICATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabla de candidatos a duplicado pendientes de revisión
CREATE TABLE IF NOT EXISTS "patient_duplicate_candidates" (
  "id"             TEXT NOT NULL,
  "patientAId"     TEXT,
  "patientBId"     TEXT,
  "patientAName"   TEXT NOT NULL,
  "patientBName"   TEXT NOT NULL,
  "matchedByField" TEXT NOT NULL,
  "status"         "PatientDuplicateCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "keptPatientId"  TEXT,
  "resolvedById"   TEXT,
  "resolvedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_duplicate_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "patient_duplicate_candidates_status_idx"
  ON "patient_duplicate_candidates"("status");
CREATE INDEX IF NOT EXISTS "patient_duplicate_candidates_patientAId_idx"
  ON "patient_duplicate_candidates"("patientAId");
CREATE INDEX IF NOT EXISTS "patient_duplicate_candidates_patientBId_idx"
  ON "patient_duplicate_candidates"("patientBId");

-- patientAId/patientBId usan SET NULL (no CASCADE) al borrar un paciente:
-- así la fila sobrevive como historial cuando la fusión borra al duplicado.
DO $$ BEGIN
  ALTER TABLE "patient_duplicate_candidates"
    ADD CONSTRAINT "patient_duplicate_candidates_patientAId_fkey"
    FOREIGN KEY ("patientAId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_duplicate_candidates"
    ADD CONSTRAINT "patient_duplicate_candidates_patientBId_fkey"
    FOREIGN KEY ("patientBId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_duplicate_candidates"
    ADD CONSTRAINT "patient_duplicate_candidates_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
