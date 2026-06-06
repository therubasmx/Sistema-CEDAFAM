import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { assignmentCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { createNotification, NotificationType } from "@/lib/notifications";

/**
 * POST /api/assignments — assign a patient to a psychologist (coordination).
 * Deactivates any prior active assignment for the patient, then notifies the
 * chosen psychologist. Runs in a transaction.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("assignments:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = assignmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { patientId, psychologistId, isExploratorySession } = parsed.data;

  const [patient, psychologist] = await Promise.all([
    db.patient.findUnique({ where: { id: patientId } }),
    db.psychologist.findUnique({
      where: { id: psychologistId },
      include: { user: true },
    }),
  ]);

  if (!patient) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  if (!psychologist || !psychologist.isActive) {
    return Response.json({ error: "Psicólogo no disponible" }, { status: 404 });
  }

  const assignment = await db.$transaction(async (tx) => {
    await tx.patientAssignment.updateMany({
      where: { patientId, isActive: true },
      data: { isActive: false },
    });

    const created = await tx.patientAssignment.create({
      data: {
        patientId,
        psychologistId,
        assignedById: user.id,
        isExploratorySession,
        isActive: true,
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "PatientAssignment",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: { patientId, psychologistId, isExploratorySession },
      },
      tx,
    );

    await createNotification(
      {
        userId: psychologist.userId,
        type: NotificationType.PATIENT_ASSIGNED,
        title: "Nuevo paciente asignado",
        message: `Se te asignó a ${patient.fullName}${
          isExploratorySession ? " (sesión de exploración)" : ""
        }.`,
        relatedEntityId: patientId,
      },
      tx,
    );

    return created;
  });

  return Response.json(assignment, { status: 201 });
}
