import { type NextRequest } from "next/server";
import { AppointmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { recordAudit, AuditAction } from "@/lib/audit";

/**
 * GET /api/appointments/requests — solicitudes de cita que la Contadora debe
 * atender: pendientes de revisión y las ya rechazadas que aún esperan a que
 * el psicólogo reenvíe una nueva propuesta. Al aceptar una solicitud
 * desaparece de este listado (pasa a SCHEDULED); al reenviarse, vuelve a
 * aparecer como pendiente.
 */
export async function GET() {
  const guard = await requirePermission("appointments:review");
  if (guard instanceof Response) return guard;

  const requests = await db.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.REJECTED] },
    },
    // El enum declara PENDING antes que REJECTED, así que ordenar por status
    // agrupa primero las pendientes (accionables) y luego las rechazadas.
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    include: {
      patient: { select: { id: true, fullName: true } },
      psychologist: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  return Response.json(requests);
}

/**
 * DELETE /api/appointments/requests — borra solicitudes rechazadas
 * seleccionadas por la Contadora. Solo acepta REJECTED (nunca PENDING, que
 * sigue requiriendo una decisión); al borrarse también desaparecen del
 * calendario, ya que es el mismo registro de Appointment.
 */
export async function DELETE(req: NextRequest) {
  const guard = await requirePermission("appointments:review");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return Response.json({ error: "Debes indicar al menos una solicitud" }, { status: 400 });
  }

  const toDelete = await db.appointment.findMany({
    where: { id: { in: ids }, status: AppointmentStatus.REJECTED },
    select: { id: true },
  });
  if (toDelete.length === 0) {
    return Response.json(
      { error: "Ninguna de las solicitudes indicadas es una rechazada válida" },
      { status: 404 },
    );
  }

  await db.$transaction(async (tx) => {
    await tx.appointment.deleteMany({
      where: { id: { in: toDelete.map((a) => a.id) } },
    });
    for (const a of toDelete) {
      await recordAudit(
        { userId: user.id, entityType: "Appointment", entityId: a.id, action: AuditAction.DELETE },
        tx,
      );
    }
  });

  return Response.json({ ok: true, deleted: toDelete.length });
}
