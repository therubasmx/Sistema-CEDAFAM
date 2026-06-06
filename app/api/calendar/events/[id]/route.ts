import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/calendar/events/[id] — elimina un evento interno
 * (jefatura/coordinación).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("events:manage");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    await tx.calendarEvent.delete({ where: { id } });
    await recordAudit(
      {
        userId: user.id,
        entityType: "CalendarEvent",
        entityId: id,
        action: AuditAction.DELETE,
      },
      tx,
    );
  });

  return Response.json({ ok: true });
}
