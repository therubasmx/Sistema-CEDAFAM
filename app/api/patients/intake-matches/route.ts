import { requirePermission } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { activityInclude } from "@/lib/patient-status";
import { PatientIntakeMatchStatus } from "@prisma/client";

/**
 * GET /api/patients/intake-matches — solicitudes del form público que
 * hicieron match con un expediente existente y esperan revisión (Coordinación).
 */
export async function GET() {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;

  const matches = await db.patientIntakeMatch.findMany({
    where: { status: PatientIntakeMatchStatus.PENDING },
    orderBy: { createdAt: "asc" },
    include: {
      matchedPatient: { include: activityInclude },
    },
  });

  return Response.json(matches);
}
