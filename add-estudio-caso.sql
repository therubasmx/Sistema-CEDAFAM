-- Estudio de Caso (Coordinación Desarrollo Profesional).
-- Cambio de esquema aditivo: agrega el valor CASE_STUDY al enum EventKind.
--
-- Requiere haber corrido antes add-puestos-coordinacion.sql, que creó ese tipo.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- correr esta sentencia sola (ya lo es, pero el editor de Neon a veces
-- envuelve todo el script en una transacción).

ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'CASE_STUDY';
