import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pendingWeekFor } from "@/lib/weekly-report";
import { createNotification, NotificationType } from "@/lib/notifications";
import { weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-report-reminder
 * Scheduled Monday 00:00 (local) via vercel.json. For every active
 * psychologist whose previous-week report is overdue, creates a
 * WEEKLY_REPORT_DUE notification (deduped per week). The blocking modal is
 * driven independently by /api/weekly-reports/pending, so this is just the
 * heads-up nudge.
 *
 * Protected by CRON_SECRET. Vercel Cron sends this automatically; manual calls
 * must pass `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Falla cerrado: si el secreto no está configurado, el endpoint queda
  // bloqueado en lugar de abierto al público.
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const psychologists = await db.psychologist.findMany({
    where: { isActive: true },
    select: { id: true, userId: true },
  });

  let notified = 0;
  for (const p of psychologists) {
    const resolved = await pendingWeekFor(p.id);
    if (!resolved || !resolved.blocking) continue;

    // Dedupe: skip if we already nudged for this exact week.
    const already = await db.notification.findFirst({
      where: {
        userId: p.userId,
        type: NotificationType.WEEKLY_REPORT_DUE,
        relatedEntityId: resolved.weekStartDate.toISOString(),
      },
    });
    if (already) continue;

    await createNotification({
      userId: p.userId,
      type: NotificationType.WEEKLY_REPORT_DUE,
      title: "Reporte semanal vencido",
      message: `Debes completar el reporte de la ${weekLabel(
        resolved.weekStartDate,
      )} para acceder al sistema.`,
      relatedEntityId: resolved.weekStartDate.toISOString(),
    });
    notified++;
  }

  return Response.json({ ok: true, notified });
}
