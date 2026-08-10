import { WorkType, AppointmentStatus, EventScope } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveReportWeek, type ResolvedWeek } from "@/lib/week";
import { mxDayAndTime, formatMxDateInput, mxSlotStart } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lunes a viernes de la semana de `weekStart`, en el calendario de Ciudad de
 * México, más la ventana [lunes 00:00, sábado 00:00) de esa semana.
 *
 * `weekStart` viene de `startOfWeek` (lib/week.ts), que trabaja en la zona
 * horaria del servidor — UTC en Vercel. Ahí "lunes 00:00" es en realidad el
 * domingo a las 18:00 en México, así que no se puede usar tal cual para sacar
 * fechas mexicanas: recorre toda la semana un día. Anclamos al mediodía para
 * caer sin ambigüedad dentro del lunes mexicano venga el servidor en UTC o en
 * hora de México, y de ahí avanzamos en saltos de 24 h exactas (México no
 * tiene horario de verano desde 2022).
 */
function mxWeekdays(weekStart: Date): {
  days: { dayOfWeek: number; dateStr: string }[];
  start: Date;
  end: Date;
} {
  const mondayStr = formatMxDateInput(new Date(weekStart.getTime() + 12 * 60 * 60 * 1000));
  const monday = mxSlotStart(mondayStr, "00:00");
  const days = Array.from({ length: 5 }, (_, offset) => ({
    dayOfWeek: offset + 1,
    dateStr: formatMxDateInput(new Date(monday.getTime() + offset * DAY_MS)),
  }));
  return { days, start: monday, end: new Date(monday.getTime() + 5 * DAY_MS) };
}

// Misma rejilla de bloques de una hora que components/calendar/appointment-dialog.tsx
// y components/forms/weekly-report-form.tsx: toda cita se agenda alineada a uno
// de estos horarios, así que sirve para mapear una cita ya agendada a un bloque
// de disponibilidad.
const HOUR_SLOTS: { startTime: string; endTime: string }[] = [
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "11:00", endTime: "12:00" },
  { startTime: "12:00", endTime: "13:00" },
  { startTime: "14:30", endTime: "15:30" },
  { startTime: "15:30", endTime: "16:30" },
  { startTime: "16:30", endTime: "17:30" },
  { startTime: "17:30", endTime: "18:30" },
];

/** Bloques de una hora que ocupa una cita, encadenando cuando dura más de una hora. */
function occupiedSlots(scheduledAt: Date, duration: number): string[] {
  const { time } = mxDayAndTime(scheduledAt);
  const startIdx = HOUR_SLOTS.findIndex((s) => s.startTime === time);
  if (startIdx === -1) return [];
  const count = Math.round(duration / 60);
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const slot = HOUR_SLOTS[startIdx + i];
    if (!slot) break;
    if (i > 0 && HOUR_SLOTS[startIdx + i - 1].endTime !== slot.startTime) break;
    result.push(slot.startTime);
  }
  return result;
}

/**
 * Resolves the week a given psychologist should currently report on, taking
 * their join date and already-submitted weeks into account. Returns null when
 * nothing is pending.
 *
 * Medio tiempo nunca bloquea: el reporte sigue apareciendo como pendiente
 * (recordatorio + formulario), pero no dispara el modal obligatorio.
 */
export async function pendingWeekFor(
  psychologistId: string,
  now: Date = new Date(),
): Promise<ResolvedWeek | null> {
  const psychologist = await db.psychologist.findUnique({
    where: { id: psychologistId },
    select: { startDate: true, isActive: true, workType: true },
  });
  if (!psychologist || !psychologist.isActive) return null;

  // Look back a few weeks — enough to catch the previous + current week.
  const reports = await db.weeklyReport.findMany({
    where: { psychologistId },
    select: { weekStartDate: true },
    orderBy: { weekStartDate: "desc" },
    take: 8,
  });

  const submitted = reports.map((r) => r.weekStartDate.getTime());
  const resolved = resolveReportWeek(now, psychologist.startDate, submitted);
  if (!resolved) return null;

  if (psychologist.workType === WorkType.PART_TIME) {
    return { ...resolved, blocking: false };
  }
  return resolved;
}

/**
 * Horas de atención de la semana: suma la duración real (en minutos) de las
 * citas del psicólogo con estado Asistió dentro de lunes-viernes de
 * `weekStartDate`, y no lo que el psicólogo escriba a mano. Misma fuente de
 * verdad que `buildPsychologistReport` en lib/reports.ts.
 */
export async function attendedHoursForWeek(
  psychologistId: string,
  weekStartDate: Date,
): Promise<number> {
  const { start, end } = mxWeekdays(weekStartDate); // lunes 00:00 → sábado 00:00, hora MX
  const result = await db.appointment.aggregate({
    where: {
      psychologistId,
      status: AppointmentStatus.ATTENDED,
      scheduledAt: { gte: start, lt: end },
    },
    _sum: { duration: true },
  });
  return Math.round((result._sum.duration ?? 0) / 60);
}

export interface OccupiedSlot {
  dayOfWeek: number;
  startTime: string;
  /** Por qué ya no está libre: una cita agendada, o un evento que le bloquea la agenda. */
  reason: "appointment" | "event";
  /** Título del evento; solo presente cuando reason = "event". */
  detail?: string;
}

/** Bloques de HOUR_SLOTS de lunes a viernes de `weekStart` que se solapan con un evento. */
function eventSlots(
  days: { dayOfWeek: number; dateStr: string }[],
  event: { startAt: Date; endAt: Date },
): { dayOfWeek: number; startTime: string }[] {
  const result: { dayOfWeek: number; startTime: string }[] = [];
  for (const { dayOfWeek, dateStr } of days) {
    for (const slot of HOUR_SLOTS) {
      const slotStart = mxSlotStart(dateStr, slot.startTime);
      const slotEnd = mxSlotStart(dateStr, slot.endTime);
      if (slotStart < event.endAt && slotEnd > event.startAt) {
        result.push({ dayOfWeek, startTime: slot.startTime });
      }
    }
  }
  return result;
}

/**
 * Bloques dayOfWeek/startTime donde el psicólogo ya tiene un compromiso
 * dentro de lunes-viernes de `weekStart`: una cita agendada (confirmada), o
 * un evento de calendario que le bloquea la agenda (junta, estudio de caso,
 * permiso aprobado, evento de Extensión a la Comunidad donde fue invitada,
 * etc.). Sirve para bloquear esos horarios en "Horarios disponibles próxima
 * semana" del reporte: si ya está ocupado, no se puede ofrecer como libre
 * para un paciente nuevo.
 */
export async function occupiedSlotsForWeek(
  psychologistId: string,
  weekStart: Date,
): Promise<OccupiedSlot[]> {
  const { days, start, end } = mxWeekdays(weekStart); // lunes 00:00 → sábado 00:00, hora MX

  const [appointments, events] = await Promise.all([
    db.appointment.findMany({
      where: {
        psychologistId,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
        scheduledAt: { gte: start, lt: end },
      },
      select: { scheduledAt: true, duration: true },
    }),
    db.calendarEvent.findMany({
      where: {
        blocksAgenda: true,
        startAt: { lt: end },
        endAt: { gt: start },
        OR: [
          { scope: EventScope.ALL },
          { scope: EventScope.SELECTED, attendees: { some: { psychologistId } } },
        ],
      },
      select: { title: true, startAt: true, endAt: true },
    }),
  ]);

  const fromAppointments: OccupiedSlot[] = appointments.flatMap((a) => {
    const { dayOfWeek } = mxDayAndTime(a.scheduledAt);
    return occupiedSlots(a.scheduledAt, a.duration).map((startTime) => ({
      dayOfWeek,
      startTime,
      reason: "appointment" as const,
    }));
  });

  const fromEvents: OccupiedSlot[] = events.flatMap((ev) =>
    eventSlots(days, ev).map(({ dayOfWeek, startTime }) => ({
      dayOfWeek,
      startTime,
      reason: "event" as const,
      detail: ev.title,
    })),
  );

  return [...fromAppointments, ...fromEvents];
}
