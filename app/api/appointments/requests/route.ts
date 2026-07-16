import { AppointmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

/**
 * GET /api/appointments/requests — solicitudes de cita pendientes de revisión
 * por la Contadora, ordenadas por la fecha propuesta más próxima.
 */
export async function GET() {
  const guard = await requirePermission("appointments:review");
  if (guard instanceof Response) return guard;

  const requests = await db.appointment.findMany({
    where: { status: AppointmentStatus.PENDING },
    orderBy: { scheduledAt: "asc" },
    include: {
      patient: { select: { id: true, fullName: true } },
      psychologist: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  return Response.json(requests);
}
