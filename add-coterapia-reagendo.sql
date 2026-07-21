-- Coterapia en citas + estado "Reagendó".
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para: AppointmentStatus (RESCHEDULED) y la columna appointments.coTherapistId
-- (segundo psicólogo opcional, visible también en su calendario personal).
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Nuevo estado de cita (Reagendó)
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULED';

-- 2) Columna para el coterapeuta (FK a psychologists, sin cascada)
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "coTherapistId" TEXT
  REFERENCES "psychologists"("id");

CREATE INDEX IF NOT EXISTS "appointments_coTherapistId_idx" ON "appointments"("coTherapistId");
