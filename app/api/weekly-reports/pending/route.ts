import { addWeeks } from "date-fns";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import {
  pendingWeekFor,
  attendedHoursForWeek,
  occupiedSlotsForWeek,
} from "@/lib/weekly-report";
import { weekLabel } from "@/lib/week";

/**
 * GET /api/weekly-reports/pending
 * Returns whether the logged-in attendant must submit a report.
 * Applies to any role that has a psychologist profile.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  if (!user.psychologistId) {
    return Response.json({ blocking: false, pending: false });
  }

  const resolved = await pendingWeekFor(user.psychologistId);
  if (!resolved) {
    return Response.json({ blocking: false, pending: false });
  }

  const hoursOfAttention = await attendedHoursForWeek(
    user.psychologistId,
    resolved.weekStartDate,
  );
  // La disponibilidad que se captura en este reporte es para la semana
  // siguiente a la que se reporta.
  const nextWeekStart = addWeeks(resolved.weekStartDate, 1);
  const occupiedSlots = await occupiedSlotsForWeek(
    user.psychologistId,
    nextWeekStart,
  );

  // Los horarios que declaró en su reporte anterior, para precargar la
  // rejilla: casi siempre repite el mismo horario, así que arrancar en blanco
  // lo obligaba a volver a marcar ~20 casillas cada semana (y terminaba
  // marcando de menos).
  const previousAvailability = await db.psychologistAvailability.findMany({
    where: { psychologistId: user.psychologistId, isActive: true },
    select: { dayOfWeek: true, startTime: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return Response.json({
    blocking: resolved.blocking,
    pending: true,
    weekStartDate: resolved.weekStartDate.toISOString(),
    weekLabel: weekLabel(resolved.weekStartDate),
    hoursOfAttention,
    occupiedSlots,
    previousAvailability,
  });
}
