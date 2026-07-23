-- Editar/eliminar solicitud de permiso desde Coordinación Desarrollo
-- Profesional, y evento informativo en el calendario de quien revisa.
--
-- Cambio de esquema aditivo y no destructivo. Agrega la columna
-- "reviewerCalendarEventId" a leave_requests: apunta al evento informativo
-- (no bloquea agenda) que se crea al aprobar, visible solo en el calendario
-- de quien aprobó el permiso, cuando no es la misma persona que lo pidió.
--
-- Requiere haber corrido antes add-permisos.sql.
-- Ejecutar en el SQL Editor de Neon.

ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "reviewerCalendarEventId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "leave_requests_reviewerCalendarEventId_key"
  ON "leave_requests"("reviewerCalendarEventId");

DO $$ BEGIN
  ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_reviewerCalendarEventId_fkey"
    FOREIGN KEY ("reviewerCalendarEventId") REFERENCES "calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
