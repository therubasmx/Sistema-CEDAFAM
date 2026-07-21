-- Solicitudes de permiso (Coordinación Desarrollo Profesional).
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para las adiciones de: los enums LeaveStatus, LeaveProgram y LeaveUnit, los
-- valores LEAVE_REQUEST, LEAVE_REQUEST_RESULT y EVENT_INVITATION de
-- NotificationType, y la tabla leave_requests.
--
-- Requiere haber corrido antes add-puestos-coordinacion.sql: leave_requests
-- referencia calendar_events, y el permiso aprobado se apoya en el alcance
-- SELECTED que agregó esa migración.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Estado, programa y unidad del permiso
DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveProgram" AS ENUM (
    'POSTGRADUATE',
    'SOCIAL_SERVICE',
    'INTERNSHIP',
    'VOLUNTEER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveUnit" AS ENUM ('HOURS', 'DAYS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Nuevos tipos de notificación
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_REQUEST_RESULT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVENT_INVITATION';

-- 3) Tabla de solicitudes
CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id"              TEXT NOT NULL,
  "psychologistId"  TEXT NOT NULL,
  "requestedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "area"            "Speciality" NOT NULL,
  "program"         "LeaveProgram" NOT NULL,
  "unit"            "LeaveUnit" NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "startDate"       TIMESTAMP(3) NOT NULL,
  "endDate"         TIMESTAMP(3) NOT NULL,
  "startTime"       TEXT,
  "endTime"         TEXT,
  "reason"          TEXT NOT NULL,
  "status"          "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"    TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "reviewNote"      TEXT,
  "calendarEventId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leave_requests_calendarEventId_key"
  ON "leave_requests"("calendarEventId");
CREATE INDEX IF NOT EXISTS "leave_requests_psychologistId_idx"
  ON "leave_requests"("psychologistId");
CREATE INDEX IF NOT EXISTS "leave_requests_status_idx"
  ON "leave_requests"("status");
CREATE INDEX IF NOT EXISTS "leave_requests_startDate_idx"
  ON "leave_requests"("startDate");

DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_psychologistId_fkey"
    FOREIGN KEY ("psychologistId") REFERENCES "psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Si se borra el bloqueo del calendario, la solicitud sobrevive sin él.
DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_calendarEventId_fkey"
    FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
