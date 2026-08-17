import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import {
  findConflictingEvent,
  findPsychologistConflict,
  findActiveAppointmentOverlap,
  countOverlappingAppointments,
} from "@/lib/events";
import { MAX_CONCURRENT_APPOINTMENTS, HOUR_SLOTS } from "@/lib/labels";
import { mxDayAndTime, mxSlotStart } from "@/lib/utils";
import { mondayOf } from "@/lib/week";

/** Por qué un bloque no se puede usar. `null` = se puede agendar ahí. */
export type SlotBlockCode =
  | "UNAVAILABLE"
  | "PAST"
  | "EVENT"
  | "TAKEN"
  | "FULL"
  | "CO_UNAVAILABLE"
  | "CO_EVENT"
  | "CO_TAKEN";

const REASON_LABELS: Record<SlotBlockCode, string> = {
  UNAVAILABLE: "Sin disponibilidad",
  PAST: "Ya pasó",
  EVENT: "Evento",
  TAKEN: "Ocupado",
  FULL: "Sin consultorios",
  CO_UNAVAILABLE: "Coterapeuta sin disponibilidad",
  CO_EVENT: "Coterapeuta en evento",
  CO_TAKEN: "Coterapeuta ocupado",
};

/** Disponibilidad declarada de una persona para el día que se está viendo. */
interface DeclaredAvailability {
  /** `startTime` de los bloques que marcó disponibles ese día. */
  declared: Set<string>;
  /** Si tiene algún bloque declarado en toda la semana. */
  hasAvailability: boolean;
}

async function loadAvailability(
  psychologistId: string,
  weekStartDate: Date,
  dayOfWeek: number,
): Promise<DeclaredAvailability> {
  const [dayBlocks, weekBlockCount] = await Promise.all([
    db.psychologistAvailability.findMany({
      where: { psychologistId, weekStartDate, dayOfWeek, isActive: true },
      select: { startTime: true },
    }),
    db.psychologistAvailability.count({
      where: { psychologistId, weekStartDate, isActive: true },
    }),
  ]);
  return {
    declared: new Set(dayBlocks.map((b) => b.startTime)),
    hasAvailability: weekBlockCount > 0,
  };
}

/**
 * Estado de un bloque para *una* persona: si no lo declaró disponible, si un
 * evento le bloquea la agenda o si ya tiene otra cita encima. `null` = libre.
 */
async function personBlock(
  psychologistId: string,
  availability: DeclaredAvailability,
  startTime: string,
  start: Date,
  end: Date,
  countsPending: boolean,
  excludeId?: string,
): Promise<"UNAVAILABLE" | "EVENT" | "TAKEN" | null> {
  if (availability.hasAvailability && !availability.declared.has(startTime)) {
    return "UNAVAILABLE";
  }
  if (await findConflictingEvent(start, end, psychologistId)) return "EVENT";
  const overlap = countsPending
    ? await findActiveAppointmentOverlap(psychologistId, start, end, excludeId)
    : await findPsychologistConflict(psychologistId, start, end, excludeId);
  return overlap ? "TAKEN" : null;
}

/**
 * GET /api/appointments/available-slots
 *   ?psychologistId=&date=YYYY-MM-DD&duration=60&coTherapistId=&excludeId=
 *
 * Estado de cada bloque de la rejilla de atención para un psicólogo en un día
 * dado. Devuelve **siempre los ocho bloques**, cada uno marcado como
 * disponible u ocupado, para que el formulario pueda mostrarlos apagados y
 * explicar por qué:
 *   - el psicólogo no lo declaró disponible en su reporte semanal (UNAVAILABLE),
 *   - ya pasó (PAST),
 *   - lo bloquea un evento interno (EVENT),
 *   - el psicólogo ya tiene otra cita a esa hora (TAKEN),
 *   - no quedan consultorios libres en toda la clínica a esa hora (FULL).
 *
 * Si la cita es en coterapia, `coTherapistId` suma las mismas verificaciones
 * sobre el coterapeuta (CO_UNAVAILABLE, CO_EVENT, CO_TAKEN): el horario tiene
 * que servirles a los dos, porque los dos estarán en sesión.
 *
 * `hasAvailability` / `coHasAvailability` dicen si esa persona tiene *algún*
 * bloque declarado para la semana de `date`. Cuando es `false` —no declaró
 * disponibilidad para esa semana en su reporte— no se le marca ningún bloque
 * como no disponible: si no, no se le podría agendar nada.
 */
export async function GET(req: NextRequest) {
  // Lo consultan tanto la Recepción al agendar como cualquiera que cree una
  // cita o solicitud desde el calendario, incluido el propio psicólogo.
  const guard = await requirePermission("appointments:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  const { searchParams } = new URL(req.url);
  const psychologistId = searchParams.get("psychologistId") ?? "";
  const coTherapistId = searchParams.get("coTherapistId") || null;
  const date = searchParams.get("date") ?? "";
  const duration = Number(searchParams.get("duration")) || 60;
  const excludeId = searchParams.get("excludeId") ?? undefined;

  if (!psychologistId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || duration <= 0) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  // Día y lunes de la semana en hora de México (mediodía evita cualquier
  // borde de día al convertir a la zona horaria del servidor).
  const dateNoon = mxSlotStart(date, "12:00");
  const { dayOfWeek } = mxDayAndTime(dateNoon);
  const weekStartDate = mondayOf(dateNoon);

  const [availability, coAvailability] = await Promise.all([
    loadAvailability(psychologistId, weekStartDate, dayOfWeek),
    coTherapistId && coTherapistId !== psychologistId
      ? loadAvailability(coTherapistId, weekStartDate, dayOfWeek)
      : Promise.resolve(null),
  ]);

  // Misma regla que POST /api/appointments: para la Recepción y el Jefe solo
  // estorban las citas ya confirmadas (son quienes aprueban); para los demás
  // también cuenta cualquier solicitud viva del psicólogo a esa hora.
  const countsPending = user.role !== Role.ACCOUNTANT && user.role !== Role.ADMIN;

  const now = Date.now();

  const slots = await Promise.all(
    HOUR_SLOTS.map(async ({ startTime, label }) => {
      const start = mxSlotStart(date, startTime);
      const end = new Date(start.getTime() + duration * 60_000);

      let code: SlotBlockCode | null = null;
      if (start.getTime() < now) {
        code = "PAST";
      } else {
        code = await personBlock(
          psychologistId,
          availability,
          startTime,
          start,
          end,
          countsPending,
          excludeId,
        );
        if (!code && coAvailability && coTherapistId) {
          const coCode = await personBlock(
            coTherapistId,
            coAvailability,
            startTime,
            start,
            end,
            countsPending,
            excludeId,
          );
          if (coCode) code = `CO_${coCode}` as SlotBlockCode;
        }
        if (
          !code &&
          (await countOverlappingAppointments(start, end, excludeId)) >=
            MAX_CONCURRENT_APPOINTMENTS
        ) {
          code = "FULL";
        }
      }

      return {
        startTime,
        label,
        available: code === null,
        code,
        reason: code ? REASON_LABELS[code] : null,
      };
    }),
  );

  return Response.json({
    dayOfWeek,
    hasAvailability: availability.hasAvailability,
    coHasAvailability: coAvailability?.hasAvailability ?? null,
    slots,
  });
}
