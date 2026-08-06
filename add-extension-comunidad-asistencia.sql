-- Datos de asistencia de los eventos de Extensión a la Comunidad.
-- Cambio de esquema aditivo y no destructivo: columnas nullable en
-- calendar_events, capturadas a mano al editar un evento COMMUNITY ya
-- realizado (personas beneficiadas, mujeres, hombres, rangos de edad).
--
-- Ejecutar en el SQL Editor de Neon.

ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "beneficiaryCount" INTEGER;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "womenCount" INTEGER;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "menCount" INTEGER;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "ageRanges" JSONB;
