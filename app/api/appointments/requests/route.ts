import { AppointmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

/**
 * GET /api/appointments/requests — solicitudes de cita que la Contadora debe
 * atender: pendientes de revisión y las ya rechazadas que aún esperan a que
 * el psicólogo reenvíe una nueva propuesta. Al aceptar una solicitud
 * desaparece de este listado (pasa a SCHEDULED); al reenviarse, vuelve a
 * aparecer como pendiente.
 */
export async function GET() {
  const guard = await requirePermission("appointments:review");
  if (guard instanceof Response) return guard;

  const requests = await db.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.REJECTED] },
    },
    // El enum declara PENDING antes que REJECTED, así que ordenar por status
    // agrupa primero las pendientes (accionables) y luego las rechazadas.
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    include: {
      patient: { select: { id: true, fullName: true } },
      psychologist: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  return Response.json(requests);
}
