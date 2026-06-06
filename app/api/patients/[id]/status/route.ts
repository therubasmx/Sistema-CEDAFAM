import { type NextRequest } from "next/server";
import { Role, ServiceType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { statusUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/patients/[id]/status — append a new status to the patient history.
 * patient_statuses is append-only: every change inserts a row.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:status");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  // Psychologists may only change status for their own active patients.
  if (user.role === Role.PSYCHOLOGIST) {
    const mine = await db.patientAssignment.findFirst({
      where: { patientId: id, psychologistId: user.psychologistId ?? "", isActive: true },
    });
    if (!mine) return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

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

  const status = await db.$transaction(async (tx) => {
    const created = await tx.patientStatus.create({
      data: {
        patientId: id,
        serviceType: data.serviceType,
        therapyStatus:
          data.serviceType === ServiceType.THERAPY ? data.therapyStatus : null,
        evaluationStatus:
          data.serviceType === ServiceType.EVALUATION ? data.evaluationStatus : null,
        changedById: user.id,
        notes: data.notes || null,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "PatientStatus",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: {
          serviceType: data.serviceType,
          therapyStatus: data.therapyStatus,
          evaluationStatus: data.evaluationStatus,
        },
      },
      tx,
    );
    return created;
  });

  return Response.json(status, { status: 201 });
}
