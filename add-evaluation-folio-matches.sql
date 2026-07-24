-- Cola de revisión para ligar folios de evaluación del registro anterior
-- (sin paciente ligado) a un expediente ya existente, cuando comparten
-- número de expediente de hospital. A diferencia de
-- patient_duplicate_candidates, aquí no hay fusión de dos pacientes: solo
-- ligar el folio o descartar la sugerencia. Cambio de esquema aditivo y no
-- destructivo. Equivale a `prisma db push` para: el enum
-- EvaluationFolioMatchStatus y la tabla evaluation_folio_matches.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Estado de la revisión del match
DO $$ BEGIN
  CREATE TYPE "EvaluationFolioMatchStatus" AS ENUM ('PENDING', 'LINKED', 'NOT_MATCH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabla de candidatos folio↔paciente pendientes de revisión
CREATE TABLE IF NOT EXISTS "evaluation_folio_matches" (
  "id"                   TEXT NOT NULL,
  "evaluationFolioId"    TEXT NOT NULL,
  "candidatePatientId"   TEXT,
  "candidatePatientName" TEXT NOT NULL,
  "matchedByField"       TEXT NOT NULL,
  "status"               "EvaluationFolioMatchStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedById"         TEXT,
  "resolvedAt"           TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_folio_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evaluation_folio_matches_evaluationFolioId_key" UNIQUE ("evaluationFolioId")
);

CREATE INDEX IF NOT EXISTS "evaluation_folio_matches_status_idx"
  ON "evaluation_folio_matches"("status");
CREATE INDEX IF NOT EXISTS "evaluation_folio_matches_candidatePatientId_idx"
  ON "evaluation_folio_matches"("candidatePatientId");

-- evaluationFolioId usa CASCADE: si el folio (nunca se borran hoy) llegara a
-- desaparecer, la sugerencia pendiente sobre él ya no tiene sentido.
DO $$ BEGIN
  ALTER TABLE "evaluation_folio_matches"
    ADD CONSTRAINT "evaluation_folio_matches_evaluationFolioId_fkey"
    FOREIGN KEY ("evaluationFolioId") REFERENCES "evaluation_folios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- candidatePatientId usa SET NULL (no CASCADE): si el paciente candidato se
-- borra (p. ej. fusionado como duplicado), la fila sobrevive como historial
-- y la vista ya la excluye por candidatePatientId nulo.
DO $$ BEGIN
  ALTER TABLE "evaluation_folio_matches"
    ADD CONSTRAINT "evaluation_folio_matches_candidatePatientId_fkey"
    FOREIGN KEY ("candidatePatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "evaluation_folio_matches"
    ADD CONSTRAINT "evaluation_folio_matches_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
