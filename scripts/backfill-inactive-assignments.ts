/**
 * Corrige asignaciones activas que quedaron "colgadas" de antes de que el
 * sistema liberara el cupo automáticamente al reportar un estado de salida
 * (cancelado, alta voluntaria, alta terapéutica, nunca vino, referido, o
 * evaluación cancelada). Esas asignaciones siguen contando en "Capacidad de
 * psicólogos" aunque el paciente ya no esté activo.
 *
 * Para cada asignación activa, revisa el último estado reportado del
 * paciente (patient_statuses). Si ese último estado es un estado de salida,
 * desactiva la asignación.
 *
 * Uso:
 *   npm run backfill:inactive-assignments             # solo reporta, no escribe (dry-run)
 *   npm run backfill:inactive-assignments -- --apply   # aplica los cambios
 */
import { PrismaClient } from "@prisma/client";
import { freesCapacity } from "../lib/patient-status";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const activeAssignments = await db.patientAssignment.findMany({
    where: { isActive: true },
    select: {
      id: true,
      patient: {
        select: {
          id: true,
          fullName: true,
          statuses: {
            orderBy: { changedAt: "desc" },
            take: 1,
            select: { therapyStatus: true, evaluationStatus: true },
          },
        },
      },
      psychologist: { select: { user: { select: { name: true } } } },
    },
  });

  const toDeactivate = activeAssignments.filter((a) => {
    const last = a.patient.statuses[0];
    if (!last) return false;
    return freesCapacity(last.therapyStatus, last.evaluationStatus);
  });

  if (toDeactivate.length === 0) {
    console.log("Nada que corregir: todas las asignaciones activas están al día.");
    await db.$disconnect();
    return;
  }

  console.log(`${toDeactivate.length} asignación(es) a desactivar:\n`);
  for (const a of toDeactivate) {
    const last = a.patient.statuses[0];
    console.log(
      `  ${a.patient.fullName} — psicólogo: ${a.psychologist.user.name ?? "?"} — último estado: ${
        last.therapyStatus ?? last.evaluationStatus
      }`,
    );
  }

  if (!APPLY) {
    console.log("\nDry-run: no se escribió nada. Vuelve a correr con --apply para aplicar.");
    await db.$disconnect();
    return;
  }

  const result = await db.patientAssignment.updateMany({
    where: { id: { in: toDeactivate.map((a) => a.id) } },
    data: { isActive: false },
  });
  console.log(`\n${result.count} asignación(es) desactivada(s).`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
