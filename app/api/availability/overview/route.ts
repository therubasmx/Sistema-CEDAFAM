import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { Role } from "@prisma/client";
import { addWeeks } from "date-fns";

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
      weeklyReports: {
        orderBy: { weekStartDate: "desc" },
        take: 1,
        select: { weekStartDate: true, submittedAt: true },
      },
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
    orderBy: { user: { name: "asc" } },
  });

  // La disponibilidad de cada reporte aplica a la semana siguiente a la
  // reportada, así que cada psicólogo puede tener una semana "objetivo"
  // distinta según cuándo mandó su último reporte.
  const targetWeekByPsychologist = new Map(
    psychologists
      .filter((p) => p.weeklyReports[0])
      .map((p) => [p.id, addWeeks(p.weeklyReports[0].weekStartDate, 1)]),
  );
  const targetWeeks = [...new Set([...targetWeekByPsychologist.values()].map((d) => d.getTime()))].map(
    (t) => new Date(t),
  );

  const availability = targetWeeks.length
    ? await db.psychologistAvailability.findMany({
        where: {
          psychologistId: { in: [...targetWeekByPsychologist.keys()] },
          weekStartDate: { in: targetWeeks },
          isActive: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      })
    : [];

  return Response.json(
    psychologists.map((p) => {
      const targetWeek = targetWeekByPsychologist.get(p.id);
      const blocks = targetWeek
        ? availability.filter(
            (a) =>
              a.psychologistId === p.id &&
              a.weekStartDate.getTime() === targetWeek.getTime(),
          )
        : [];
      return {
        id: p.id,
        name: p.user.name,
        speciality: p.speciality,
        workType: p.workType,
        activePatientCount: p._count.assignments,
        availability: blocks.map((a) => ({
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        lastReport: p.weeklyReports[0]
          ? {
              weekStartDate: p.weeklyReports[0].weekStartDate,
              submittedAt: p.weeklyReports[0].submittedAt,
            }
          : null,
      };
    }),
  );
}
