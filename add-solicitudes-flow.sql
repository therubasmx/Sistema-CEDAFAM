-- Flujo de solicitudes de cita (Contadora aprueba/rechaza).
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para las adiciones de: AppointmentStatus (PENDING, REJECTED),
-- NotificationType (APPOINTMENT_REQUEST, APPOINTMENT_REQUEST_RESULT) y
-- la columna appointments.rejectionReason.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Nuevos estados de cita (Pendiente y Rechazada)
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'SCHEDULED';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- 2) Nuevos tipos de notificación (solicitud y resultado)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REQUEST' BEFORE 'APPOINTMENT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REQUEST_RESULT' BEFORE 'APPOINTMENT_REMINDER';

-- 3) Columna para el motivo del rechazo
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
