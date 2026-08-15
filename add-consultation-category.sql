-- Categoría del motivo de consulta.
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para: el enum "ConsultationCategory" y la columna
-- patients.consultationCategory (nullable — los expedientes ya capturados
-- quedan "Sin categorizar" hasta que alguien los clasifique al asignar).
--
-- Ejecutar en el SQL Editor de Neon.

-- 1) Enum con las 7 categorías
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConsultationCategory') THEN
    CREATE TYPE "ConsultationCategory" AS ENUM (
      'EMOTIONAL_DISTRESS',
      'COUPLES_THERAPY',
      'FAMILY_PROBLEMS',
      'ACADEMIC_PROBLEMS',
      'NEUROPSYCHOLOGICAL_EVALUATION',
      'PSYCHOLOGICAL_EVALUATION',
      'PSYCHIATRY'
    );
  END IF;
END
$$;

-- 2) Columna en el expediente (sin valor por defecto: se captura a mano)
ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "consultationCategory" "ConsultationCategory";
