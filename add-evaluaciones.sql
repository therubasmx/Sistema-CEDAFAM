-- Folios de evaluación.
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para el modelo EvaluationFolio: el folio consecutivo que el evaluador abre
-- desde el expediente de un paciente de Evaluación Psicológica o
-- Neuropsicológica, y que la Contadora consulta en el módulo de Evaluaciones.
--
-- El consecutivo arranca en 206 porque el centro ya llevaba folios en papel
-- hasta el 205 (ver FIRST_EVALUATION_FOLIO en lib/evaluations.ts). El número
-- lo calcula la aplicación, no la base: aquí solo se garantiza que no se
-- repita.
--
-- Ejecutar en el SQL Editor de Neon.

CREATE TABLE IF NOT EXISTS "evaluation_folios" (
  "id"                TEXT NOT NULL,
  "folio"             INTEGER NOT NULL,
  "patientId"         TEXT NOT NULL,
  "evaluatorId"       TEXT NOT NULL,
  "diagnosis"         TEXT NOT NULL,
  "firstInterviewAt"  TIMESTAMP(3) NOT NULL,
  "resultsDeliveryAt" TIMESTAMP(3) NOT NULL,
  "reportLink"        TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "evaluation_folios_pkey" PRIMARY KEY ("id")
);

-- Un folio no se repite y un paciente tiene a lo más uno.
CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_folios_folio_key"
  ON "evaluation_folios"("folio");
CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_folios_patientId_key"
  ON "evaluation_folios"("patientId");

CREATE INDEX IF NOT EXISTS "evaluation_folios_evaluatorId_idx"
  ON "evaluation_folios"("evaluatorId");
CREATE INDEX IF NOT EXISTS "evaluation_folios_firstInterviewAt_idx"
  ON "evaluation_folios"("firstInterviewAt");

-- Borrar el expediente se lleva su folio; borrar al evaluador no (queda el
-- registro de quién firmó la evaluación).
ALTER TABLE "evaluation_folios"
  ADD CONSTRAINT "evaluation_folios_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evaluation_folios"
  ADD CONSTRAINT "evaluation_folios_evaluatorId_fkey"
  FOREIGN KEY ("evaluatorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
