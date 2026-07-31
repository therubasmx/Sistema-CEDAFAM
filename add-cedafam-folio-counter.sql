-- Contador de consecutivo para "Expediente CEDAFAM". A partir de ahora este
-- sistema asigna el folio automáticamente al crear un paciente (alta directa
-- de Coordinación o solicitud pública del formulario), en vez de capturarlo
-- a mano. Cambio de esquema aditivo y no destructivo.
--
-- Ejecutar en el SQL Editor de Neon.

CREATE TABLE IF NOT EXISTS "sequence_counters" (
  "name"  TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("name")
);

-- Semilla: 3019 es el expediente CEDAFAM más alto ya asignado hoy, así que
-- el primer paciente nuevo recibe 3020. No pisa el valor si ya existiera.
INSERT INTO "sequence_counters" ("name", "value")
VALUES ('cedafamFolio', 3019)
ON CONFLICT ("name") DO NOTHING;
