import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Standard JSON error response for API routes. */
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * CEDAFAM operates in Mexico City time (UTC-6, no DST since 2022). Server
 * components run in the host's runtime timezone (UTC on Vercel), which does
 * NOT match the browser's local timezone used by client components like the
 * calendar. Any date formatted server-side must go through these helpers so
 * it agrees with what the calendar shows.
 */
const MX_TIMEZONE = "America/Mexico_City";
const MX_UTC_OFFSET_MS = 6 * 60 * 60 * 1000;

/** "HH:mm" in Mexico City time. */
export function formatMxTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: MX_TIMEZONE,
  });
}

/** "miércoles 15 de julio" style weekday label in Mexico City time. */
export function formatMxWeekdayDate(date: Date): string {
  const weekday = date.toLocaleDateString("es-MX", {
    weekday: "long",
    timeZone: MX_TIMEZONE,
  });
  const day = date.toLocaleDateString("es-MX", {
    day: "numeric",
    timeZone: MX_TIMEZONE,
  });
  const month = date.toLocaleDateString("es-MX", {
    month: "long",
    timeZone: MX_TIMEZONE,
  });
  return `${weekday} ${day} de ${month}`;
}

/** "d MMM yyyy HH:mm" style in Mexico City time. */
export function formatMxDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const datePart = d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: MX_TIMEZONE,
  });
  return `${datePart} ${formatMxTime(d)}`;
}

/** Start of the Mexico City calendar day containing `date`, as a UTC instant. */
export function startOfMxDay(date: Date): Date {
  const shifted = new Date(date.getTime() - MX_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) + MX_UTC_OFFSET_MS,
  );
}

/** End of the Mexico City calendar day containing `date`, as a UTC instant. */
export function endOfMxDay(date: Date): Date {
  return new Date(startOfMxDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}
