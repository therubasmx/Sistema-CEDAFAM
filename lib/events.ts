import { AppointmentStatus, EventScope, Room } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Busca un evento interno que impida agendarle una cita a `psychologistId`
 * dentro del rango [start, end).
 *
 * No todos los eventos aplican a todo el mundo: los de alcance `ALL` bloquean
 * a cualquier psicólogo, mientras que los `SELECTED` (evento comunitario,
 * permiso aprobado) solo bloquean a quienes están en su lista de invitados.
 * Los eventos con `blocksAgenda` en false —un cumpleaños, por ejemplo— son
 * informativos y nunca bloquean. Devuelve el evento en conflicto o `null`.
 */
export async function findConflictingEvent(
  start: Date,
  end: Date,
  psychologistId: string,
) {
  return db.calendarEvent.findFirst({
    where: {
      blocksAgenda: true,
      startAt: { lt: end },
      endAt: { gt: start },
      OR: [
        { scope: EventScope.ALL },
        {
          scope: EventScope.SELECTED,
          attendees: { some: { psychologistId } },
        },
      ],
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

/**
 * Busca una cita **confirmada** (agendada o asistida) del mismo psicólogo que
 * se solape con [start, end). Sirve para verificar que el psicólogo no quede
 * con dos pacientes a la misma hora. Devuelve la cita en conflicto o `null`;
 * `excludeId` omite la propia cita.
 */
export async function findPsychologistConflict(
  psychologistId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const candidates = await db.appointment.findMany({
    where: {
      psychologistId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
      scheduledAt: {
        gte: new Date(start.getTime() - 8 * 60 * 60_000),
        lte: end,
      },
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

/**
 * Busca una solicitud/cita **viva** (no cancelada ni rechazada) de
 * `psychologistId` que se solape con [start, end). A diferencia de
 * `findPsychologistConflict` (solo SCHEDULED/ATTENDED), también cuenta
 * PENDING: dos solicitudes del mismo psicólogo no pueden coexistir en el
 * mismo horario. Devuelve la cita en conflicto o `null`; `excludeId` omite
 * la propia cita.
 */
export async function findActiveAppointmentOverlap(
  psychologistId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const candidates = await db.appointment.findMany({
    where: {
      psychologistId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: {
        notIn: [
          AppointmentStatus.CANCELLED,
          AppointmentStatus.REJECTED,
          AppointmentStatus.RESCHEDULED,
        ],
      },
      scheduledAt: {
        gte: new Date(start.getTime() - 8 * 60 * 60_000),
        lte: end,
      },
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

/**
 * Cuenta cuántas solicitudes/citas activas (PENDING o SCHEDULED, de
 * cualquier psicólogo) se solapan con [start, end). Sirve para topar cuántas
 * pueden coexistir al mismo tiempo en toda la clínica: no hay más
 * consultorios que `MAX_CONCURRENT_APPOINTMENTS`. `excludeId` omite la
 * propia cita (reenvío).
 */
export async function countOverlappingAppointments(
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const candidates = await db.appointment.findMany({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.SCHEDULED] },
      scheduledAt: {
        gte: new Date(start.getTime() - 8 * 60 * 60_000),
        lte: end,
      },
    },
    select: { scheduledAt: true, duration: true },
  });

  return candidates.filter((a) => {
    const aStart = a.scheduledAt.getTime();
    const aEnd = aStart + a.duration * 60_000;
    return aStart < end.getTime() && start.getTime() < aEnd;
  }).length;
}
