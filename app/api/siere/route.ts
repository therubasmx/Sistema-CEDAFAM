import { type NextRequest } from "next/server";
import { Role, ServiceArea } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { siereCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { notifyRole, NotificationType } from "@/lib/notifications";

/**
 * GET /api/siere?patientId=X — SIERE applications for a patient.
 * Psychologists are scoped to their own patients.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const patientId = new URL(req.url).searchParams.get("patientId");
  if (!patientId) {
    return Response.json({ error: "patientId es requerido" }, { status: 400 });
  }

  if (user.role === Role.PSYCHOLOGIST) {
    const mine = await db.patientAssignment.findFirst({
      where: { patientId, psychologistId: user.psychologistId ?? "", isActive: true },
    });
    if (!mine) return Response.json([]);
  }

  const applications = await db.siereApplication.findMany({
    where: { patientId },
    orderBy: { requestedAt: "desc" },
    include: {
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      psychologist: { include: { user: { select: { name: true } } } },
    },
  });
  return Response.json(applications);
}

/**
 * POST /api/siere — register a SIERE (beneficencia) discount request.
 * The treating psychologist is derived from the patient's active assignment.
 * SIERE applies to therapy, not evaluations. Coordination is notified to
 * approve (the request is also made verbally per the operational flow).
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("siere:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = siereCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { patientId, discountLevel } = parsed.data;

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    include: { assignments: { where: { isActive: true }, take: 1 } },
  });
  if (!patient) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  if (patient.serviceArea === ServiceArea.PSYCHOLOGICAL_EVALUATION) {
    return Response.json(
      { error: "SIERE aplica a terapias, no a evaluaciones" },
      { status: 400 },
    );
  }

  const assignment = patient.assignments[0];
  if (!assignment) {
    return Response.json(
      { error: "El paciente no tiene psicólogo asignado" },
      { status: 400 },
    );
  }

  // Psychologists may only request for their own patients.
  if (
    user.role === Role.PSYCHOLOGIST &&
    assignment.psychologistId !== user.psychologistId
  ) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  const application = await db.$transaction(async (tx) => {
    const created = await tx.siereApplication.create({
      data: {
        patientId,
        psychologistId: assignment.psychologistId,
        discountLevel,
        requestedById: user.id,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "SiereApplication",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: { patientId, discountLevel },
      },
      tx,
    );
    await notifyRole(
      Role.COORDINATOR,
      {
        type: NotificationType.URGENT,
        title: "Solicitud SIERE",
        message: `Se solicitó SIERE para ${patient.fullName}. Requiere aprobación.`,
        relatedEntityId: patientId,
      },
      tx,
    );
    return created;
  });

  return Response.json(application, { status: 201 });
}
