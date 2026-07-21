import { type NextRequest } from "next/server";
import { ServiceType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { statusUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string; statusId: string }> };

/**
 * PATCH /api/patients/[id]/status/[statusId] — corrige una entrada puntual
 * del historial (por ejemplo, si un psicólogo seleccionó el estado
 * equivocado). A diferencia de PUT /status, no agrega una fila nueva.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:statusManage");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id, statusId } = await params;

  const existing = await db.patientStatus.findFirst({
    where: { id: statusId, patientId: id },
  });
  if (!existing) return Response.json({ error: "No encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.patientStatus.update({
      where: { id: statusId },
      data: {
        serviceType: data.serviceType,
        therapyStatus:
          data.serviceType === ServiceType.EVALUATION ? null : data.therapyStatus,
        evaluationStatus:
          data.serviceType === ServiceType.EVALUATION ? data.evaluationStatus : null,
        notes: data.notes || null,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "PatientStatus",
        entityId: statusId,
        action: AuditAction.UPDATE,
        changedFields: {
          before: {
            serviceType: existing.serviceType,
            therapyStatus: existing.therapyStatus,
            evaluationStatus: existing.evaluationStatus,
          },
          after: {
            serviceType: data.serviceType,
            therapyStatus: data.therapyStatus,
            evaluationStatus: data.evaluationStatus,
          },
        },
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}

/** DELETE /api/patients/[id]/status/[statusId] — borra una entrada del historial. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:statusManage");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id, statusId } = await params;

  const existing = await db.patientStatus.findFirst({
    where: { id: statusId, patientId: id },
  });
  if (!existing) return Response.json({ error: "No encontrado" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.patientStatus.delete({ where: { id: statusId } });
    await recordAudit(
      {
        userId: user.id,
        entityType: "PatientStatus",
        entityId: statusId,
        action: AuditAction.DELETE,
        changedFields: {
          serviceType: existing.serviceType,
          therapyStatus: existing.therapyStatus,
          evaluationStatus: existing.evaluationStatus,
        },
      },
      tx,
    );
  });

  return Response.json({ ok: true });
}
