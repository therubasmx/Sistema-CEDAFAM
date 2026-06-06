import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { serviceAreaToSpeciality } from "@/lib/labels";

/**
 * GET /api/assignments/suggestions?patientId=X
 * Returns the top 3 psychologist suggestions, scored by:
 *   - speciality match for the patient's serviceArea (strong weight)
 *   - current active-patient load (lighter load ranks higher)
 *   - configured availability for the patient's preferred time slot
 * Coordination makes the final choice — this is advisory only.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("assignments:suggest");
  if (guard instanceof Response) return guard;

  const patientId = new URL(req.url).searchParams.get("patientId");
  if (!patientId) {
    return Response.json({ error: "patientId es requerido" }, { status: 400 });
  }

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  if (patient.isHistorical) {
    return Response.json({ error: "Los pacientes históricos no requieren asignación" }, { status: 400 });
  }

  const matchingSpecialities = serviceAreaToSpeciality[patient.serviceArea];

  const psychologists = await db.psychologist.findMany({
    where: { isActive: true, endDate: null },
    include: {
      user: { select: { name: true } },
      availability: { where: { isActive: true } },
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
  });

  if (psychologists.length === 0) return Response.json([]);

  const maxLoad = Math.max(1, ...psychologists.map((p) => p._count.assignments));

  const scored = psychologists.map((p) => {
    const specialityMatch = matchingSpecialities.includes(p.speciality);
    // Preferred slot maps to a rough hour range; we only check a slot is set up.
    const hasAvailability = p.availability.length > 0;

    const loadScore = 1 - p._count.assignments / maxLoad; // 0..1, less load = higher
    const specialityScore = specialityMatch ? 1 : 0;
    const availabilityScore = hasAvailability ? 1 : 0;

    const score =
      specialityScore * 0.55 + loadScore * 0.35 + availabilityScore * 0.1;

    return {
      psychologistId: p.id,
      name: p.user.name,
      speciality: p.speciality,
      workType: p.workType,
      activePatientCount: p._count.assignments,
      specialityMatch,
      hasAvailability,
      score: Number(score.toFixed(3)),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return Response.json(scored.slice(0, 3));
}
