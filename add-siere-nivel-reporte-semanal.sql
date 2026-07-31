-- Nivel de SIERE (0-4) capturado en el reporte semanal cuando el tipo de
-- paciente elegido es SIERE. Reutiliza el enum DiscountLevel ya usado en las
-- solicitudes formales de SIERE, agregando el nivel 0 (gratuito).
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez), antes que el
-- resto del script.

-- 1) Nuevo nivel del enum compartido
ALTER TYPE "DiscountLevel" ADD VALUE IF NOT EXISTS 'LEVEL_0' BEFORE 'LEVEL_1';

-- 2) Nivel SIERE reflejado en el paciente (como patientType)
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "siereDiscountLevel" "DiscountLevel";

-- 3) Nivel SIERE capturado en cada actualización del reporte semanal
ALTER TABLE "weekly_report_patient_updates" ADD COLUMN IF NOT EXISTS "discountLevel" "DiscountLevel";
