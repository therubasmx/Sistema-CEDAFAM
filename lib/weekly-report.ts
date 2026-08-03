import { WorkType, AppointmentStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { resolveReportWeek, type ResolvedWeek } from "@/lib/week";
import { mxDayAndTime } from "@/lib/utils";

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
  const weekEnd = addDays(weekStartDate, 5); // sábado 00:00, exclusive
  const result = await db.appointment.aggregate({
    where: {
      psychologistId,
      status: AppointmentStatus.ATTENDED,
      scheduledAt: { gte: weekStartDate, lt: weekEnd },
    },
    _sum: { duration: true },
  });
  return Math.round((result._sum.duration ?? 0) / 60);
}

/**
 * Bloques dayOfWeek/startTime donde el psicólogo ya tiene una cita agendada
 * (confirmada) dentro de lunes-viernes de `weekStart`. Sirve para precargar
 * "Horarios disponibles próxima semana" en el reporte: si ya tiene un
 * paciente en ese horario, obviamente está disponible ahí.
 */
export async function scheduledSlotsForWeek(
  psychologistId: string,
  weekStart: Date,
): Promise<{ dayOfWeek: number; startTime: string }[]> {
  const weekEnd = addDays(weekStart, 5); // sábado 00:00, exclusive
  const appointments = await db.appointment.findMany({
    where: {
      psychologistId,
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
      scheduledAt: { gte: weekStart, lt: weekEnd },
    },
    select: { scheduledAt: true, duration: true },
  });

  return appointments.flatMap((a) => {
    const { dayOfWeek } = mxDayAndTime(a.scheduledAt);
    return occupiedSlots(a.scheduledAt, a.duration).map((startTime) => ({
      dayOfWeek,
      startTime,
    }));
  });
}
