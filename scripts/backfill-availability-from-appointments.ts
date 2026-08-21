/**
 * Reconstruye los bloques de disponibilidad que el reporte semanal borró.
 *
 * Hasta este arreglo, el formulario del reporte descontaba de la rejilla los
 * horarios que ya tenían una cita o un evento encima, y al enviarse reemplazaba
 * `psychologist_availability` completa. Resultado: cada hora en la que el
 * psicólogo tenía paciente desaparecía de su horario declarado, seguía muerta
 * aunque la cita se cancelara, y el borrado se acumulaba semana tras semana
 * porque la rejilla se precarga desde esa misma tabla.
 *
 * La evidencia para reconstruir está en el calendario: si alguien atendió (o
 * tiene agendado) a un paciente el miércoles a las 2:30 pm, el miércoles a las
 * 2:30 pm es parte de su horario de atención. Este script agrega los bloques
 * que el historial de citas respalda y que hoy faltan.
 *
 * No toca nada más: no borra bloques existentes ni inventa horarios sin citas
 * que los sustenten.
 *
 * Uso:
 *   npm run backfill:availability                        # dry-run, no escribe
 *   npm run backfill:availability -- --apply             # aplica
 *   npm run backfill:availability -- --weeks=12 --apply  # otra ventana (default 8)
 */
import { PrismaClient, AppointmentStatus } from "@prisma/client";
import { HOUR_SLOTS, isOfferedSlot } from "../lib/labels";
import { mxDayAndTime } from "../lib/utils";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const WEEKS = Number(process.argv.find((a) => a.startsWith("--weeks="))?.split("=")[1]) || 8;

/**
 * Bloques de una hora que ocupa una cita, encadenando cuando dura más de una.
 * Misma regla que `occupiedSlots` en lib/weekly-report.ts.
 */
function slotsFor(scheduledAt: Date, duration: number): string[] {
  const { time } = mxDayAndTime(scheduledAt);
  const startIdx = HOUR_SLOTS.findIndex((s) => s.startTime === time);
  if (startIdx === -1) return []; // cita fuera de la rejilla (capturada a mano)
  const result: string[] = [];
  for (let i = 0; i < Math.round(duration / 60); i++) {
    const slot = HOUR_SLOTS[startIdx + i];
    if (!slot) break;
    // Los bloques de la mañana y la tarde no son contiguos (11:00→12:00 sí,
    // 12:00→14:30 no): una cita larga no se derrama sobre la comida.
    if (i > 0 && HOUR_SLOTS[startIdx + i - 1].endTime !== slot.startTime) break;
    result.push(slot.startTime);
  }
  return result;
}

async function main() {
  const since = new Date(Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000);

  const psychologists = await db.psychologist.findMany({
    where: { isActive: true },
    select: {
      id: true,
      user: { select: { name: true } },
      availability: {
        where: { isActive: true },
        select: { dayOfWeek: true, startTime: true },
      },
    },
  });

  const appointments = await db.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
      scheduledAt: { gte: since },
    },
    select: {
      psychologistId: true,
      coTherapistId: true,
      scheduledAt: true,
      duration: true,
    },
  });

  // psychologistId → "dayOfWeek|startTime" → cuántas citas lo respaldan.
  const evidence = new Map<string, Map<string, number>>();
  const bump = (psychologistId: string, key: string) => {
    const forPsy = evidence.get(psychologistId) ?? new Map<string, number>();
    forPsy.set(key, (forPsy.get(key) ?? 0) + 1);
    evidence.set(psychologistId, forPsy);
  };

  for (const a of appointments) {
    const { dayOfWeek } = mxDayAndTime(a.scheduledAt);
    // La coterapia ocupa a las dos personas: las dos estuvieron en sesión.
    const people = [a.psychologistId, a.coTherapistId].filter(
      (id): id is string => !!id,
    );
    for (const startTime of slotsFor(a.scheduledAt, a.duration)) {
      if (!isOfferedSlot(dayOfWeek, startTime)) continue;
      for (const id of people) bump(id, `${dayOfWeek}|${startTime}`);
    }
  }

  const toCreate: {
    psychologistId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[] = [];
  const report: { name: string; blocks: { key: string; citas: number }[] }[] = [];

  for (const psy of psychologists) {
    // Quien nunca ha declarado horarios no tiene nada que reconstruir: hoy
    // se le puede agendar en cualquier bloque, y sembrarle filas se lo
    // restringiría en vez de arreglarle algo.
    if (psy.availability.length === 0) continue;

    const declared = new Set(
      psy.availability.map((a) => `${a.dayOfWeek}|${a.startTime}`),
    );
    const missing = [...(evidence.get(psy.id) ?? new Map<string, number>())]
      .filter(([key]) => !declared.has(key))
      .sort(([a], [b]) => a.localeCompare(b));
    if (missing.length === 0) continue;

    report.push({
      name: psy.user.name ?? "?",
      blocks: missing.map(([key, citas]) => ({ key, citas })),
    });
    for (const [key] of missing) {
      const [dayStr, startTime] = key.split("|");
      const slot = HOUR_SLOTS.find((s) => s.startTime === startTime)!;
      toCreate.push({
        psychologistId: psy.id,
        dayOfWeek: Number(dayStr),
        startTime,
        endTime: slot.endTime,
      });
    }
  }

  const DAY_NAMES = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  console.log(
    `Ventana: últimas ${WEEKS} semanas (desde ${since.toISOString().slice(0, 10)}).\n`,
  );

  if (toCreate.length === 0) {
    console.log("Nada que reconstruir: toda cita agendada cae en un bloque ya declarado.");
    await db.$disconnect();
    return;
  }

  for (const { name, blocks } of report) {
    console.log(`  ${name} — ${blocks.length} bloque(s):`);
    for (const { key, citas } of blocks) {
      const [day, startTime] = key.split("|");
      console.log(
        `      ${DAY_NAMES[Number(day)]} ${startTime}  (${citas} cita${citas === 1 ? "" : "s"})`,
      );
    }
  }
  console.log(
    `\n${toCreate.length} bloque(s) en ${report.length} psicólogo(s).`,
  );

  if (!APPLY) {
    console.log("\nDry-run: no se escribió nada. Vuelve a correr con --apply para aplicar.");
    await db.$disconnect();
    return;
  }

  const result = await db.psychologistAvailability.createMany({ data: toCreate });
  console.log(`\n${result.count} bloque(s) restaurado(s).`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
