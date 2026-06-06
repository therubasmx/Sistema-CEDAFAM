import { type NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { patientUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** GET /api/patients/[id] — detail (role-scoped for psychologists). */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { psychologist: { include: { user: { select: { name: true } } } } },
        orderBy: { assignedAt: "desc" },
      },
      statuses: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
      },
      appointments: { orderBy: { scheduledAt: "desc" } },
    },
  });

  if (!patient) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  if (user.role === Role.PSYCHOLOGIST) {
    const isMine = patient.assignments.some(
      (a) => a.psychologistId === user.psychologistId && a.isActive,
    );
    if (!isMine) {
      return Response.json({ error: "Permiso denegado" }, { status: 403 });
    }
  }

  return Response.json(patient);
}

/** PUT /api/patients/[id] — update (coordinator/admin). */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:update");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patientUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await db.patient.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  const data = parsed.data;
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.patient.update({
      where: { id },
      data: {
        ...data,
        curp: data.curp === "" ? null : data.curp,
        email: data.email === "" ? null : data.email,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "Patient",
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
