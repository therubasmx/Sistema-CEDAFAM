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
