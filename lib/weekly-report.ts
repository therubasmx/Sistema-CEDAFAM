import { db } from "@/lib/db";
import { resolveReportWeek, type ResolvedWeek } from "@/lib/week";

/**
 * Resolves the week a given psychologist should currently report on, taking
 * their join date and already-submitted weeks into account. Returns null when
 * nothing is pending.
 */
export async function pendingWeekFor(
  psychologistId: string,
  now: Date = new Date(),
): Promise<ResolvedWeek | null> {
  const psychologist = await db.psychologist.findUnique({
    where: { id: psychologistId },
    select: { startDate: true, isActive: true },
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
  return resolveReportWeek(now, psychologist.startDate, submitted);
}
