import {
  startOfWeek,
  subWeeks,
  addDays,
  set,
  isAfter,
  format,
} from "date-fns";
import { es } from "date-fns/locale";

/**
 * Week semantics for the mandatory weekly report.
 *
 * - A report covers one week, keyed by `weekStartDate` = that week's Monday 00:00.
 * - The deadline to submit is **Friday 12:30** of the same week.
 * - Once a new week begins, the previous week's report is overdue if missing,
 *   which triggers the blocking Monday modal.
 *
 * Note on timezone: the server runs in UTC on Vercel. CEDAFAM operates in
 * Mexico (UTC-6, no DST). For MVP we compute weeks in server time; deployment
 * sets TZ=America/Mexico_City so boundaries line up with local Mondays.
 */

/** Monday 00:00 of the week containing `date`. */
export function mondayOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Friday 12:30 deadline for the week whose Monday is `weekStart`. */
export function deadlineFor(weekStart: Date): Date {
  const friday = addDays(weekStart, 4);
  return set(friday, {
    hours: 12,
    minutes: 30,
    seconds: 0,
    milliseconds: 0,
  });
}

export interface ResolvedWeek {
  /** Monday of the week to report on. */
  weekStartDate: Date;
  /** True when the previous week's report is overdue (blocking). */
  blocking: boolean;
}

/**
 * Decides which week a psychologist should report on right now.
 *
 * @param now          current time
 * @param startDate    psychologist.startDate (don't block weeks before they joined)
 * @param submittedWeekStarts ISO timestamps of weeks already submitted
 */
export function resolveReportWeek(
  now: Date,
  startDate: Date,
  submittedWeekStarts: number[],
): ResolvedWeek | null {
  const submitted = new Set(submittedWeekStarts);
  const currentWeek = mondayOf(now);
  const previousWeek = mondayOf(subWeeks(now, 1));
  const joinWeek = mondayOf(startDate);

  // Previous week overdue → blocking, but only if they were active that week.
  if (
    previousWeek.getTime() >= joinWeek.getTime() &&
    !submitted.has(previousWeek.getTime())
  ) {
    return { weekStartDate: previousWeek, blocking: true };
  }

  // Current week not yet submitted → can submit on time (Friday allowed early).
  if (!submitted.has(currentWeek.getTime())) {
    return { weekStartDate: currentWeek, blocking: false };
  }

  return null;
}

/** True once the Friday 12:30 deadline for `weekStart` has passed. */
export function isPastDeadline(weekStart: Date, now: Date): boolean {
  return isAfter(now, deadlineFor(weekStart));
}

/** "semana del 2 al 6 de junio" style human label. */
export function weekLabel(weekStart: Date): string {
  const friday = addDays(weekStart, 4);
  return `semana del ${format(weekStart, "d", { locale: es })} al ${format(
    friday,
    "d 'de' MMMM",
    { locale: es },
  )}`;
}

/** Return the end time for a given hour slot start time. */
export function slotEndTime(startTime: string): string {
  const map: Record<string, string> = {
    "09:00": "10:00",
    "10:00": "11:00",
    "11:00": "12:00",
    "12:00": "13:00",
    "14:30": "15:30",
    "15:30": "16:30",
    "16:30": "17:30",
    "17:30": "18:30",
  };
  return map[startTime] ?? startTime;
}
