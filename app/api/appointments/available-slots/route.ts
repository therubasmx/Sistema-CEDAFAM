import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import {
  findConflictingEvent,
  findPsychologistConflict,
  countOverlappingAppointments,
} from "@/lib/events";
import { MAX_CONCURRENT_APPOINTMENTS, SLOT_LABELS } from "@/lib/labels";
import { mxDayAndTime, mxSlotStart } from "@/lib/utils";

/**
 * GET /api/appointments/available-slots?psychologistId=&date=YYYY-MM-DD&duration=60&excludeId=
 *
 * Horarios en los que la Contadora puede agendar directamente a un paciente
 * con un psicólogo, para un día dado. Solo se ofrecen los horarios que el
 * psicólogo declaró disponibles ese día (dayOfWeek); cada uno se marca como
 * disponible u ocupado según:
 *   - ya pasó (PAST),
 *   - lo bloquea un evento interno (EVENT),
 *   - el psicólogo ya tiene otra cita confirmada a esa hora (TAKEN),
 *   - no quedan consultorios libres en toda la clínica a esa hora (FULL).
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("appointments:review");
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const psychologistId = searchParams.get("psychologistId") ?? "";
  const date = searchParams.get("date") ?? "";
  const duration = Number(searchParams.get("duration")) || 60;
  const excludeId = searchParams.get("excludeId") ?? undefined;

  if (!psychologistId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || duration <= 0) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  // Día de la semana en hora de México (mediodía evita cualquier borde de día).
  const { dayOfWeek } = mxDayAndTime(mxSlotStart(date, "12:00"));

  const blocks = await db.psychologistAvailability.findMany({
    where: { psychologistId, dayOfWeek, isActive: true },
    orderBy: { startTime: "asc" },
  });

  const now = Date.now();
  const startTimes = Array.from(new Set(blocks.map((b) => b.startTime)));

  const slots = await Promise.all(
    startTimes.map(async (startTime) => {
      const start = mxSlotStart(date, startTime);
      const end = new Date(start.getTime() + duration * 60_000);

      let reason: "PAST" | "EVENT" | "TAKEN" | "FULL" | null = null;
      if (start.getTime() < now) {
        reason = "PAST";
      } else if (await findConflictingEvent(start, end)) {
        reason = "EVENT";
      } else if (await findPsychologistConflict(psychologistId, start, end, excludeId)) {
        reason = "TAKEN";
      } else if (
        (await countOverlappingAppointments(start, end, excludeId)) >=
        MAX_CONCURRENT_APPOINTMENTS
      ) {
        reason = "FULL";
      }

      return {
        startTime,
        label: SLOT_LABELS[startTime] ?? startTime,
        available: reason === null,
        reason,
      };
    }),
  );

  return Response.json({ dayOfWeek, slots });
}
