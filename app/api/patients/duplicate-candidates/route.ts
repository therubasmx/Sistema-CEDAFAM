import { requirePermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { activityInclude } from "@/lib/patient-status";
import { PatientDuplicateCandidateStatus } from "@prisma/client";

/**
 * GET /api/patients/duplicate-candidates — posibles duplicados detectados
 * entre expedientes ya existentes (ver scripts/find-duplicate-patients.ts)
 * que esperan revisión de Coordinación. Se excluyen las filas cuyo expediente
 * ya desapareció por otra vía (borrado manual, o absorbido por otra fusión):
 * no queda nada que comparar.
 */
export async function GET() {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;

  const candidates = await db.patientDuplicateCandidate.findMany({
    where: {
      status: PatientDuplicateCandidateStatus.PENDING,
      patientAId: { not: null },
      patientBId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    include: {
      patientA: { include: activityInclude },
      patientB: { include: activityInclude },
    },
  });

  return Response.json(candidates);
}
