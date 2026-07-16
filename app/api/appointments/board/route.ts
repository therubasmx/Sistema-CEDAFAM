import { type NextRequest } from "next/server";
import { AppointmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { startOfMxDay, endOfMxDay } from "@/lib/utils";

/**
 * GET /api/appointments/board?date=ISO — citas confirmadas del día indicado
 * (zona horaria de la Ciudad de México) para el tablero de Consultorios.
 *
 * Devuelve tanto las que ya tienen consultorio asignado como las que no
 * (`room = null`, el grupo de pacientes por asignar). Solo la Contadora (y el
 * Jefe) gestionan este tablero.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("appointments:assignRoom");
  if (guard instanceof Response) return guard;

  const dateParam = req.nextUrl.searchParams.get("date");
  const ref = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(ref.getTime())) {
    return Response.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const dayStart = startOfMxDay(ref);
  const dayEnd = endOfMxDay(ref);

  const appointments = await db.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      duration: true,
      serviceType: true,
      status: true,
      room: true,
      patient: { select: { id: true, fullName: true } },
      psychologist: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  return Response.json(appointments);
}
