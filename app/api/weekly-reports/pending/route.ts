import { Role } from "@prisma/client";
import { requireAuth } from "@/lib/api-auth";
import { pendingWeekFor } from "@/lib/weekly-report";
import { weekLabel } from "@/lib/week";

/**
 * GET /api/weekly-reports/pending
 * Tells the client whether the logged-in psychologist must submit a report,
 * and whether it's overdue (blocking). Non-psychologists get nothing pending.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  if (user.role !== Role.PSYCHOLOGIST || !user.psychologistId) {
    return Response.json({ blocking: false, pending: false });
  }

  const resolved = await pendingWeekFor(user.psychologistId);
  if (!resolved) {
    return Response.json({ blocking: false, pending: false });
  }

  return Response.json({
    blocking: resolved.blocking,
    pending: true,
    weekStartDate: resolved.weekStartDate.toISOString(),
    weekLabel: weekLabel(resolved.weekStartDate),
  });
}
