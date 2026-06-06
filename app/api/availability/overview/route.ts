import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Role } from "@prisma/client";

/** GET /api/availability/overview — all active psychologists with their availability blocks.
 * Only accessible to admin, coordinator, and accountant roles.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  if (user.role === Role.PSYCHOLOGIST) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  const psychologists = await db.psychologist.findMany({
    where: { isActive: true },
    include: {
      user: { select: { name: true } },
      availability: {
        where: { isActive: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return Response.json(
    psychologists.map((p) => ({
      id: p.id,
      name: p.user.name,
      speciality: p.speciality,
      workType: p.workType,
      activePatientCount: p._count.assignments,
      availability: p.availability.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    })),
  );
}
