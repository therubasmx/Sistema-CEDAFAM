import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Standard JSON error response for API routes. */
export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
