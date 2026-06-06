import { requireAuth } from "@/lib/api-auth";
import { pendingWeekFor } from "@/lib/weekly-report";
import { weekLabel } from "@/lib/week";

/**
 * GET /api/weekly-reports/pending
 * Returns whether the logged-in attendant must submit a report.
 * Applies to any role that has a psychologist profile.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  if (!user.psychologistId) {
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
