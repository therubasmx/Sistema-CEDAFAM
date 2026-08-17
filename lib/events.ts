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
 * ¿`psychologistId` puede tomar el bloque `startTime` (HH:mm) de `dayOfWeek`,
 * según la disponibilidad que declaró en su reporte semanal?
 *
 * Devuelve `true` también cuando no tiene **ningún** bloque declarado en toda
 * la semana —nunca ha entregado un reporte—: en ese caso no hay contra qué
 * validar y exigirlo dejaría al psicólogo imposible de agendar.
 */
export async function hasDeclaredSlot(
  psychologistId: string,
  dayOfWeek: number,
  startTime: string,
): Promise<boolean> {
  const [block, weekBlockCount] = await Promise.all([
    db.psychologistAvailability.findFirst({
      where: { psychologistId, dayOfWeek, startTime, isActive: true },
      select: { id: true },
    }),
    db.psychologistAvailability.count({
      where: { psychologistId, isActive: true },
    }),
  ]);
  return !!block || weekBlockCount === 0;
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
 *
 * Cuenta tanto las citas que lleva él como aquellas a las que entró de
 * coterapeuta: en una coterapia las dos personas están la hora completa en
 * sesión, así que ese horario también les queda ocupado (mismo criterio que
 * `occupiedSlotsForWeek` en lib/weekly-report.ts).
 */
export async function findPsychologistConflict(
  psychologistId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const candidates = await db.appointment.findMany({
    where: {
      OR: [{ psychologistId }, { coTherapistId: psychologistId }],
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
 * mismo horario. Igual que aquella, cuenta las coterapias a las que lo
 * invitaron. Devuelve la cita en conflicto o `null`; `excludeId` omite la
 * propia cita.
 */
export async function findActiveAppointmentOverlap(
  psychologistId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const candidates = await db.appointment.findMany({
    where: {
      OR: [{ psychologistId }, { coTherapistId: psychologistId }],
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
 * ¿`psychologistId` tiene alguna cita viva (pendiente por confirmar o ya
 * agendada) que empiece dentro de [start, end)? Mismo criterio de estados y
 * ventana que usa la revisión de permisos (`leave-requests/[id]/review`) para
 * avisarle a Coordinación de citas afectadas; aquí sirve para impedir que el
 * propio psicólogo mande la solicitud sin antes resolver esas citas.
 */
export async function hasLiveAppointmentInRange(
  psychologistId: string,
  start: Date,
  end: Date,
): Promise<boolean> {
  const count = await db.appointment.count({
    where: {
      psychologistId,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.SCHEDULED] },
      scheduledAt: { gte: start, lt: end },
    },
  });
  return count > 0;
}

/** Estados que cuentan como una cita real del paciente al determinar su primera vez. */
const LIVE_VISIT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ATTENDED,
  AppointmentStatus.NO_SHOW,
];

/**
 * Para cada paciente en `patientIds`, la fecha de su cita "viva" más antigua
 * (no cancelada, rechazada ni reagendada). Sirve para marcar en el calendario
 * si una cita es la primera vez del paciente en CEDAFAM o ya es seguimiento:
 * la cita cuyo `scheduledAt` coincide con ese mínimo es la primera.
 */
export async function firstLiveAppointmentByPatient(
  patientIds: string[],
): Promise<Map<string, number>> {
  if (patientIds.length === 0) return new Map();
  const grouped = await db.appointment.groupBy({
    by: ["patientId"],
    where: { patientId: { in: patientIds }, status: { in: LIVE_VISIT_STATUSES } },
    _min: { scheduledAt: true },
  });
  return new Map(
    grouped
      .filter((g) => g._min.scheduledAt)
      .map((g) => [g.patientId, g._min.scheduledAt!.getTime()]),
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
