import { type NextRequest } from "next/server";
import { PatientIntakeMatchStatus, Role, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { intakeMatchDecisionSchema, publicPatientCreateSchema } from "@/lib/validators";
import { activityInclude } from "@/lib/patient-status";
import { recordAudit, AuditAction } from "@/lib/audit";
import { notifyRole, NotificationType } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

/** GET /api/patients/intake-matches/[id] — detalle para comparación lado a lado. */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;
  const { id } = await params;

  const match = await db.patientIntakeMatch.findUnique({
    where: { id },
    include: { matchedPatient: { include: activityInclude } },
  });

  if (!match) {
    return Response.json({ error: "No encontrado" }, { status: 404 });
  }

  return Response.json(match);
}

/**
 * PUT /api/patients/intake-matches/[id] — decisión de Coordinación:
 * `APPLY` actualiza/reactiva el expediente encontrado con los datos
 * entrantes; `CREATE_NEW` reconoce que es otra persona y crea un expediente
 * nuevo, como hubiera hecho el intake público sin match.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = intakeMatchDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const match = await db.patientIntakeMatch.findUnique({ where: { id } });
  if (!match) {
    return Response.json({ error: "No encontrado" }, { status: 404 });
  }
  if (match.status !== PatientIntakeMatchStatus.PENDING) {
    return Response.json({ error: "Esta solicitud ya fue revisada" }, { status: 409 });
  }

  // submittedData se guardó vía publicPatientCreateSchema; re-parsearlo con el
  // mismo schema reconstruye dateOfBirth como Date (z.coerce.date acepta el
  // ISO string guardado) sin lógica de parseo aparte.
  const data = publicPatientCreateSchema.parse(match.submittedData);

  if (parsed.data.decision === "CREATE_NEW") {
    const result = await db.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          fullName: data.fullName,
          age: data.age,
          dateOfBirth: data.dateOfBirth,
          curp: data.curp,
          phoneNumber: data.phoneNumber,
          address: data.address,
          postalCode: data.postalCode,
          email: data.email,
          serviceArea: data.serviceArea,
          referenceType: data.referenceType,
          consultationReason: data.consultationReason,
          preferredTimeSlot: data.preferredTimeSlot,
        },
      });

      await notifyRole(
        Role.COORDINATOR,
        {
          type: NotificationType.NEW_FORM_SUBMITTED,
          title: "Nueva solicitud de cita",
          message: `${created.fullName} envió el formulario y requiere revisión.`,
          relatedEntityId: created.id,
        },
        tx,
      );

      await tx.patientIntakeMatch.update({
        where: { id },
        data: {
          status: PatientIntakeMatchStatus.CREATED_NEW,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
      });

      return created;
    });

    return Response.json(result);
  }

  // decision === "APPLY": actualiza (o reactiva) el expediente encontrado.
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.patient.update({
      where: { id: match.matchedPatientId },
      data: {
        fullName: data.fullName,
        age: data.age,
        dateOfBirth: data.dateOfBirth,
        curp: data.curp,
        phoneNumber: data.phoneNumber,
        address: data.address,
        postalCode: data.postalCode,
        email: data.email,
        serviceArea: data.serviceArea,
        referenceType: data.referenceType,
        consultationReason: data.consultationReason,
        preferredTimeSlot: data.preferredTimeSlot,
        isHistorical: false,
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "Patient",
        entityId: match.matchedPatientId,
        action: AuditAction.UPDATE,
        changedFields: data as Prisma.InputJsonValue,
      },
      tx,
    );

    await tx.patientIntakeMatch.update({
      where: { id },
      data: {
        status: PatientIntakeMatchStatus.APPLIED,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });

    return updated;
  });

  return Response.json(result);
}
