import { type NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/appointments/[id] — update an appointment (status, reschedule, notes).
 * Psychologists may only modify their own.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:create");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.appointment.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  }
  if (
    user.role === Role.PSYCHOLOGIST &&
    existing.psychologistId !== user.psychologistId
  ) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = appointmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: {
        ...data,
        notes: data.notes === "" ? null : data.notes,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "Appointment",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: data as Prisma.InputJsonValue,
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}
