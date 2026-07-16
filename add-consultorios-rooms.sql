-- Tablero de Consultorios: dos consultorios nuevos en el enum Room.
-- Cambio de esquema aditivo y no destructivo. Equivale a `prisma db push`
-- para las adiciones al enum "Room":
--   - CONSULTORIO_EVALUACION (Consultorio de Evaluación)
--   - CONSULTORIO_3 (Consultorio 3)
--
-- Los demás consultorios ya existían (GESELL, LUDOTECA, OFFICE_ANTONIO,
-- CONSULTORIO_1, CONSULTORIO_2); CONSULTORIO_1 solo cambió su etiqueta en la
-- interfaz ("Consultorio 1 (Neuropsicología)"), no en la base de datos.
--
-- Ejecutar en el SQL Editor de Neon. Si aparece el error
-- "ALTER TYPE ... ADD VALUE cannot be run inside a transaction block",
-- corre cada sentencia ALTER TYPE por separado (una a la vez).

ALTER TYPE "Room" ADD VALUE IF NOT EXISTS 'CONSULTORIO_EVALUACION';
ALTER TYPE "Room" ADD VALUE IF NOT EXISTS 'CONSULTORIO_3';
