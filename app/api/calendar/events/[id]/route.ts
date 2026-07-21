import { type NextRequest } from "next/server";
import { EventKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { canManageEventKind } from "@/lib/permissions";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/calendar/events/[id] — elimina un evento interno.
 *
 * Lo puede borrar jefatura/coordinación, o el titular del puesto que administra
 * ese tipo de evento. Los bloqueos de permiso (LEAVE) no se borran aquí: se
 * retiran rechazando la solicitud, para que el permiso y su bloqueo no queden
 * desincronizados.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  if (existing.kind === EventKind.LEAVE) {
    return Response.json(
      {
        error:
          "Este bloqueo viene de un permiso aprobado. Recházalo desde Coordinación Desarrollo Profesional para liberarlo.",
      },
      { status: 409 },
    );
  }

  if (!canManageEventKind(user, existing.kind)) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
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
