-- Distingue, entre los pacientes históricos importados del Excel, cuáles NO
-- traían timestamp original de registro (su createdAt quedó como la fecha en
-- que se corrió la importación, no la fecha real de alta).
--
-- Antes, el reporte de "Pacientes nuevos por período" excluía TODOS los
-- pacientes históricos (isHistorical = true), aunque la mayoría sí tiene una
-- fecha real (el timestamp del formulario de Google original). Con esta
-- columna, el reporte solo excluye a los que de verdad no tienen fecha real.
--
-- Cambio de esquema aditivo y no destructivo. Ejecutar en el SQL Editor de Neon.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "createdAtIsEstimated" BOOLEAN NOT NULL DEFAULT false;
