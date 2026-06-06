import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

/** GET /api/psychologists — active psychologists with active-patient counts. */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;

  const psychologists = await db.psychologist.findMany({
    where: { isActive: true },
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return Response.json(
    psychologists.map((p) => ({
      id: p.id,
      name: p.user.name,
      email: p.user.email,
      speciality: p.speciality,
      workType: p.workType,
      activePatientCount: p._count.assignments,
    })),
  );
}
