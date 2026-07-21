import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { assignmentUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string; assignmentId: string }> };

/**
 * PATCH /api/patients/[id]/assignments/[assignmentId] — corrige una entrada
 * puntual del historial de asignaciones (por ejemplo, si se seleccionó al
 * psicólogo equivocado). No crea una fila nueva ni toca assignedAt/isActive.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("assignments:manage");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id, assignmentId } = await params;

  const existing = await db.patientAssignment.findFirst({
    where: { id: assignmentId, patientId: id },
  });
  if (!existing) return Response.json({ error: "No encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = assignmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const psychologist = await db.psychologist.findUnique({
    where: { id: data.psychologistId },
  });
  if (!psychologist) {
    return Response.json({ error: "Psicólogo no encontrado" }, { status: 404 });
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.patientAssignment.update({
      where: { id: assignmentId },
      data: {
        psychologistId: data.psychologistId,
        isExploratorySession: data.isExploratorySession,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "PatientAssignment",
        entityId: assignmentId,
        action: AuditAction.UPDATE,
        changedFields: {
          before: { psychologistId: existing.psychologistId },
          after: { psychologistId: data.psychologistId },
        },
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}

/**
 * DELETE /api/patients/[id]/assignments/[assignmentId] — borra una entrada
 * del historial. Si era la asignación activa, reactiva la más reciente que
 * quede (si hay alguna) para no dejar al paciente "Sin asignar" por error.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("assignments:manage");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id, assignmentId } = await params;

  const existing = await db.patientAssignment.findFirst({
    where: { id: assignmentId, patientId: id },
  });
  if (!existing) return Response.json({ error: "No encontrado" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.patientAssignment.delete({ where: { id: assignmentId } });

    if (existing.isActive) {
      const previous = await tx.patientAssignment.findFirst({
        where: { patientId: id },
        orderBy: { assignedAt: "desc" },
      });
      if (previous) {
        await tx.patientAssignment.update({
          where: { id: previous.id },
          data: { isActive: true },
        });
      }
    }

    await recordAudit(
      {
        userId: user.id,
        entityType: "PatientAssignment",
        entityId: assignmentId,
        action: AuditAction.DELETE,
        changedFields: { psychologistId: existing.psychologistId },
      },
      tx,
    );
  });

  return Response.json({ ok: true });
}
