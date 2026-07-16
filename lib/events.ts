import { AppointmentStatus, Room } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Busca un evento interno global que se solape con el rango [start, end).
 * Los eventos aplican a todos los psicólogos, así que cualquier cita cuyo
 * horario intersecte un evento queda bloqueada. Devuelve el evento en
 * conflicto o `null`.
 */
export async function findConflictingEvent(start: Date, end: Date) {
  return db.calendarEvent.findFirst({
    where: {
      startAt: { lt: end },
      endAt: { gt: start },
    },
    orderBy: { startAt: "asc" },
  });
}

/**
 * Busca una cita **confirmada** (agendada o asistida) que ya ocupe `room`
 * solapando [start, end). El consultorio de una solicitud pendiente es solo una
 * preferencia y no aparta el espacio; solo las citas ya aprobadas lo reservan.
 * Devuelve la cita en conflicto o `null`. `excludeId` omite la propia cita.
 */
export async function findRoomConflict(
  room: Room,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  // Ventana amplia (duración máx. 8h) + filtro de solape exacto en memoria,
  // igual que el chequeo de solape por psicólogo.
  const candidates = await db.appointment.findMany({
    where: {
      room,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
      scheduledAt: {
        gte: new Date(start.getTime() - 8 * 60 * 60_000),
        lte: end,
      },
    },
    include: {
      patient: { select: { fullName: true } },
      psychologist: { select: { user: { select: { name: true } } } },
    },
  });

  return (
    candidates.find((a) => {
      const aStart = a.scheduledAt.getTime();
      const aEnd = aStart + a.duration * 60_000;
      return aStart < end.getTime() && start.getTime() < aEnd;
    }) ?? null
  );
}
