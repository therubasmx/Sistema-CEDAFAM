import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { formatMxDateInput, mxSlotStart } from "@/lib/utils";

export interface BirthdayOccurrence {
  userId: string;
  name: string;
  /** Fecha del cumpleaños dentro del rango consultado (ISO). */
  date: string;
  /** Años que cumple, si se registró el año de nacimiento. */
  turningAge: number | null;
}

/**
 * GET /api/calendar/birthdays?from=ISO&to=ISO
 *
 * Los cumpleaños se repiten cada año, así que no viven como filas del
 * calendario: se guardan una vez en `users.birthDate` y aquí se proyectan las
 * ocurrencias que caen en el rango consultado. No bloquean agenda.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  if (!fromParam || !toParam) {
    return Response.json({ error: "Rango requerido" }, { status: 400 });
  }

  const from = new Date(fromParam);
  const to = new Date(toParam);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return Response.json({ error: "Rango inválido" }, { status: 400 });
  }

  const people = await db.user.findMany({
    where: { isActive: true, birthDate: { not: null } },
    select: { id: true, name: true, birthDate: true },
  });

  const occurrences: BirthdayOccurrence[] = [];

  // Todo se calcula en hora de Ciudad de México: esta ruta corre en el
  // servidor (UTC en Vercel) y un cumpleaños puesto a medianoche UTC caería el
  // día anterior en el calendario que ve la clínica.
  for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
    for (const person of people) {
      // "yyyy-MM-dd" del nacimiento, ya interpretado en hora de México.
      const [birthYear, month, day] = formatMxDateInput(person.birthDate!).split("-");
      const date = mxSlotStart(`${year}-${month}-${day}`, "00:00");
      if (date < from || date > to) continue;

      const age = year - Number(birthYear);
      occurrences.push({
        userId: person.id,
        name: person.name,
        date: date.toISOString(),
        turningAge: age > 0 ? age : null,
      });
    }
  }

  occurrences.sort((a, b) => a.date.localeCompare(b.date));
  return Response.json(occurrences);
}
