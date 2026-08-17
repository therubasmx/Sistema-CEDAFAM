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
import { MAX_CONCURRENT_APPOINTMENTS, HOUR_SLOTS, isOfferedSlot } from "@/lib/labels";
import { declaredAvailabilityCoversDate } from "@/lib/weekly-report";
import { mxDayAndTime, mxSlotStart } from "@/lib/utils";

/** Por qué un bloque no se puede usar. `null` = se puede agendar ahí. */
export type SlotBlockCode =
  | "CLOSED"
  | "UNAVAILABLE"
  | "PAST"
  | "EVENT"
  | "TAKEN"
  | "FULL"
  | "CO_UNAVAILABLE"
  | "CO_EVENT"
  | "CO_TAKEN";

const REASON_LABELS: Record<SlotBlockCode, string> = {
  CLOSED: "No se atiende",
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
  /** Si hay disponibilidad declarada que aplique a la fecha consultada. */
  hasAvailability: boolean;
  /**
   * Sí declaró horarios, pero para una semana anterior a la fecha consultada:
   * el reporte que cubre esa semana todavía no se envía. Sirve para explicarlo
   * distinto de quien nunca ha entregado un reporte.
   */
  beyondDeclaredWeek: boolean;
}

async function loadAvailability(
  psychologistId: string,
  date: Date,
  dayOfWeek: number,
): Promise<DeclaredAvailability> {
  const [dayBlocks, weekBlockCount, coversDate] = await Promise.all([
    db.psychologistAvailability.findMany({
      where: { psychologistId, dayOfWeek, isActive: true },
      select: { startTime: true },
    }),
    db.psychologistAvailability.count({
      where: { psychologistId, isActive: true },
    }),
    declaredAvailabilityCoversDate(psychologistId, date),
  ]);
  return {
    declared: new Set(dayBlocks.map((b) => b.startTime)),
    hasAvailability: weekBlockCount > 0 && coversDate,
    beyondDeclaredWeek: weekBlockCount > 0 && !coversDate,
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
 * `hasAvailability` / `coHasAvailability` dicen si esa persona tiene horario
 * declarado que aplique a `date`. Cuando es `false` no se le marca ningún
 * bloque como no disponible: si no, no se le podría agendar nada. Puede ser
 * `false` por dos razones distintas, y `beyondDeclaredWeek` las separa: nunca
 * ha entregado un reporte semanal, o `date` cae después de la semana que cubre
 * su último reporte —el que declara esa semana todavía no se envía, así que
 * queda abierta.
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

  // Día de la semana en hora de México (mediodía evita cualquier borde de día).
  const dateNoon = mxSlotStart(date, "12:00");
  const { dayOfWeek } = mxDayAndTime(dateNoon);

  const [availability, coAvailability] = await Promise.all([
    loadAvailability(psychologistId, dateNoon, dayOfWeek),
    coTherapistId && coTherapistId !== psychologistId
      ? loadAvailability(coTherapistId, dateNoon, dayOfWeek)
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
      if (!isOfferedSlot(dayOfWeek, startTime)) {
        // La clínica no atiende a esa hora ese día: no depende del psicólogo
        // ni de si declaró disponibilidad, así que se descarta primero.
        code = "CLOSED";
      } else if (start.getTime() < now) {
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
    beyondDeclaredWeek: availability.beyondDeclaredWeek,
    coHasAvailability: coAvailability?.hasAvailability ?? null,
    coBeyondDeclaredWeek: coAvailability?.beyondDeclaredWeek ?? null,
    slots,
  });
}
