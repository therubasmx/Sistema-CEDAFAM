import { type NextRequest } from "next/server";
import { Prisma, Role, ServiceArea } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { patientCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { notifyRole, NotificationType } from "@/lib/notifications";

/**
 * GET /api/patients
 * Role-scoped list with optional filters: ?q=, ?serviceArea=, ?unassigned=true, ?mine=true
 * Psychologists only see patients assigned to them.
 * ?mine=true forces assignment-scoped results for any role (used by weekly report).
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const serviceArea = searchParams.get("serviceArea") as ServiceArea | null;
  const unassigned = searchParams.get("unassigned") === "true";
  const mine = searchParams.get("mine") === "true";

  const where: Prisma.PatientWhereInput = {};

  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phoneNumber: { contains: q } },
    ];
  }
  if (serviceArea && Object.values(ServiceArea).includes(serviceArea)) {
    where.serviceArea = serviceArea;
  }
  if (unassigned) {
    where.assignments = { none: { isActive: true } };
    where.isHistorical = false;
  }

  // Restrict to own assigned patients for psychologists, or when ?mine=true is
  // passed (e.g. weekly report) for coordinators/admins who also attend patients.
  if (user.role === Role.PSYCHOLOGIST || mine) {
    if (!user.psychologistId) return Response.json([]);
    where.assignments = {
      some: { psychologistId: user.psychologistId, isActive: true },
    };
  }

  const patients = await db.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      assignments: {
        where: { isActive: true },
        include: { psychologist: { include: { user: { select: { name: true } } } } },
      },
      statuses: { orderBy: { changedAt: "desc" }, take: 1 },
    },
  });

  return Response.json(patients);
}

/**
 * POST /api/patients
 * Creates a patient (coordinator/admin). Notifies coordination. The public
 * intake form uses POST /api/public/patients instead.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("patients:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patientCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const patient = await db.$transaction(async (tx) => {
    const created = await tx.patient.create({
      data: {
        fullName: data.fullName,
        age: data.age,
        dateOfBirth: data.dateOfBirth ?? null,
        curp: data.curp || null,
        phoneNumber: data.phoneNumber,
        address: data.address || null,
        postalCode: data.postalCode || null,
        email: data.email || null,
        serviceArea: data.serviceArea,
        referenceType: data.referenceType,
        consultationReason: data.consultationReason,
        preferredTimeSlot: data.preferredTimeSlot,
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "Patient",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: { fullName: created.fullName },
      },
      tx,
    );

    await notifyRole(
      Role.COORDINATOR,
      {
        type: NotificationType.NEW_FORM_SUBMITTED,
        title: "Nuevo paciente registrado",
        message: `${created.fullName} fue registrado y requiere asignación.`,
        relatedEntityId: created.id,
      },
      tx,
    );

    return created;
  });

  return Response.json(patient, { status: 201 });
}
