import { EvaluationFolioMatchStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { activityInclude } from "@/lib/patient-status";

/**
 * GET /api/evaluations/folio-matches — folios de evaluación del registro
 * anterior sin paciente ligado, con un candidato sugerido por número de
 * expediente, pendientes de que Coordinación decida si ligarlos o no.
 */
export async function GET() {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;

  const matches = await db.evaluationFolioMatch.findMany({
    where: {
      status: EvaluationFolioMatchStatus.PENDING,
      candidatePatientId: { not: null },
    },
    orderBy: { createdAt: "asc" },
    include: {
      evaluationFolio: true,
      candidatePatient: { include: activityInclude },
    },
  });

  return Response.json(matches);
}
