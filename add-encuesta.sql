-- Encuesta de satisfacción (Coordinación Innovación e Investigación).
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para la adición de la tabla survey_responses.
--
-- Las respuestas son anónimas: la tabla no guarda ninguna referencia al
-- paciente ni al usuario que contestó. Las preguntas no viven en la base sino
-- en lib/survey.ts, y por eso `answers` es JSONB: cambiar el cuestionario no
-- requiere migrar.
--
-- Ejecutar en el SQL Editor de Neon.

CREATE TABLE IF NOT EXISTS "survey_responses" (
  "id"          TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answers"     JSONB NOT NULL,
  CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "survey_responses_submittedAt_idx"
  ON "survey_responses"("submittedAt");
