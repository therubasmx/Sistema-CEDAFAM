-- Puestos de coordinación y eventos de calendario con alcance.
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para las adiciones de: los enums Position, EventScope y EventKind, las
-- columnas users.position, users.birthDate, calendar_events.description,
-- calendar_events.location, calendar_events.scope, calendar_events.kind,
-- calendar_events.blocksAgenda, y la tabla calendar_event_attendees.
--
-- users.coordination (texto libre) NO se borra: se respalda su contenido en
-- users.position y la columna vieja queda intacta por si hay que revisarla.
-- Confirma el resultado del paso 5 antes de eliminarla a mano más adelante.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

-- 1) Puestos que puede ocupar un usuario
DO $$ BEGIN
  CREATE TYPE "Position" AS ENUM (
    'PRIVATE_CARE_SERVICES',
    'INNOVATION_RESEARCH',
    'PROFESSIONAL_DEVELOPMENT',
    'COMMUNITY_OUTREACH',
    'HUMAN_CAPITAL',
    'BIRTHDAYS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Alcance y origen de un evento del calendario
DO $$ BEGIN
  CREATE TYPE "EventScope" AS ENUM ('ALL', 'SELECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EventKind" AS ENUM (
    'GENERAL',
    'COMMUNITY',
    'HUMAN_CAPITAL',
    'BIRTHDAY_PARTY',
    'LEAVE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Columnas nuevas en usuarios
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" "Position";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "users_position_idx" ON "users"("position");

-- 4) Columnas nuevas en eventos. Los valores por defecto (ALL / GENERAL /
--    blocksAgenda = true) reproducen el comportamiento que los eventos ya
--    creados tienen hoy: globales y bloqueando agenda.
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "scope" "EventScope" NOT NULL DEFAULT 'ALL';
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "kind" "EventKind" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "blocksAgenda" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "calendar_events_kind_idx" ON "calendar_events"("kind");

-- 5) Respaldo del texto libre de coordinación al nuevo puesto.
--    La comparación es tolerante a mayúsculas, acentos y al prefijo
--    "Coordinación …", porque la columna vieja se capturaba a mano.
UPDATE "users" SET "position" = 'PRIVATE_CARE_SERVICES'
  WHERE "position" IS NULL AND "coordination" ILIKE '%atenci%privada%';

UPDATE "users" SET "position" = 'INNOVATION_RESEARCH'
  WHERE "position" IS NULL AND ("coordination" ILIKE '%innovaci%' OR "coordination" ILIKE '%investigaci%');

UPDATE "users" SET "position" = 'PROFESSIONAL_DEVELOPMENT'
  WHERE "position" IS NULL AND "coordination" ILIKE '%desarrollo%profesional%';

UPDATE "users" SET "position" = 'COMMUNITY_OUTREACH'
  WHERE "position" IS NULL AND ("coordination" ILIKE '%extensi%' OR "coordination" ILIKE '%comunidad%');

UPDATE "users" SET "position" = 'HUMAN_CAPITAL'
  WHERE "position" IS NULL AND "coordination" ILIKE '%capital%humano%';

UPDATE "users" SET "position" = 'BIRTHDAYS'
  WHERE "position" IS NULL AND "coordination" ILIKE '%cumplea%';

-- Revisa qué quedó sin mapear antes de dar por buena la migración.
-- Lo que aparezca aquí hay que asignarlo a mano desde Usuarios.
--   SELECT "name", "coordination" FROM "users"
--   WHERE "coordination" IS NOT NULL AND "position" IS NULL;

-- 6) Psicólogos invitados a un evento de alcance SELECTED
CREATE TABLE IF NOT EXISTS "calendar_event_attendees" (
  "id"             TEXT NOT NULL,
  "eventId"        TEXT NOT NULL,
  "psychologistId" TEXT NOT NULL,
  CONSTRAINT "calendar_event_attendees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_attendees_eventId_psychologistId_key"
  ON "calendar_event_attendees"("eventId", "psychologistId");
CREATE INDEX IF NOT EXISTS "calendar_event_attendees_psychologistId_idx"
  ON "calendar_event_attendees"("psychologistId");

DO $$ BEGIN
  ALTER TABLE "calendar_event_attendees"
    ADD CONSTRAINT "calendar_event_attendees_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "calendar_event_attendees"
    ADD CONSTRAINT "calendar_event_attendees_psychologistId_fkey"
    FOREIGN KEY ("psychologistId") REFERENCES "psychologists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
