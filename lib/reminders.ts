import { AppointmentStatus, NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/api-auth";

const REMINDER_WINDOW_MS = 30 * 60 * 1000;

/**
 * Materializa en notificaciones reales los recordatorios de "en ~30 min" que
 * le tocan a este usuario. Se ejecuta en cada consulta a /api/notifications
 * en vez de vía cron: el plan Hobby de Vercel no permite crons cada pocos
 * minutos, así que el propio sondeo de la campanita hace de disparador
 * mientras el usuario tenga la página abierta.
 */
export async function ensureUpcomingReminders(user: SessionUser) {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);

  await Promise.all([
    user.psychologistId
      ? remindAppointments(user.id, user.psychologistId, now, horizon)
      : Promise.resolve(),
    remindCalendarEvents(user.id, now, horizon),
  ]);
}

async function remindAppointments(
  userId: string,
  psychologistId: string,
  now: Date,
  horizon: Date,
) {
  const appointments = await db.appointment.findMany({
    where: {
      psychologistId,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: { gte: now, lte: horizon },
    },
    include: { patient: { select: { fullName: true } } },
  });
  if (appointments.length === 0) return;

  const already = await db.notification.findMany({
    where: {
      userId,
      type: NotificationType.APPOINTMENT_REMINDER,
      relatedEntityId: { in: appointments.map((a) => a.id) },
    },
    select: { relatedEntityId: true },
  });
  const alreadySet = new Set(already.map((n) => n.relatedEntityId));
  const due = appointments.filter((a) => !alreadySet.has(a.id));
  if (due.length === 0) return;

  await db.notification.createMany({
    data: due.map((a) => ({
      userId,
      type: NotificationType.APPOINTMENT_REMINDER,
      title: "Cita próxima",
      message: `Tienes una cita con ${a.patient.fullName} a las ${a.scheduledAt.toLocaleTimeString(
        "es-MX",
        { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" },
      )}.`,
      relatedEntityId: a.id,
    })),
  });
}

async function remindCalendarEvents(userId: string, now: Date, horizon: Date) {
  const events = await db.calendarEvent.findMany({
    where: { startAt: { gte: now, lte: horizon } },
  });
  if (events.length === 0) return;

  const already = await db.notification.findMany({
    where: {
      userId,
      type: NotificationType.EVENT_REMINDER,
      relatedEntityId: { in: events.map((e) => e.id) },
    },
    select: { relatedEntityId: true },
  });
  const alreadySet = new Set(already.map((n) => n.relatedEntityId));
  const due = events.filter((e) => !alreadySet.has(e.id));
  if (due.length === 0) return;

  await db.notification.createMany({
    data: due.map((e) => ({
      userId,
      type: NotificationType.EVENT_REMINDER,
      title: "Evento próximo",
      message: `${e.title} comienza a las ${e.startAt.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Mexico_City",
      })}.`,
      relatedEntityId: e.id,
    })),
  });
}
