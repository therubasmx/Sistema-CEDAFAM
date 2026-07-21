import { type NextRequest } from "next/server";
import { LeaveStatus, Position, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { canAccessPosition } from "@/lib/permissions";
import { leaveRequestCreateSchema } from "@/lib/validators";
import { NotificationType, notifyPosition } from "@/lib/notifications";
import { recordAudit, AuditAction } from "@/lib/audit";
import { leaveRangeLabel } from "@/lib/leave";

const LEAVE_COORDINATION = Position.PROFESSIONAL_DEVELOPMENT;

/** Datos que necesita el módulo para pintar una solicitud. */
const listInclude = {
  psychologist: {
    select: {
      id: true,
      speciality: true,
      workType: true,
      user: { select: { name: true, email: true } },
    },
  },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.LeaveRequestInclude;

/**
 * GET /api/leave-requests?status=PENDING
 *
 * Coordinación Desarrollo Profesional (y jefatura) ven todas las solicitudes;
 * cualquier otro usuario ve únicamente las suyas, para consultar en qué quedó
 * lo que pidió.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");

  const where: Prisma.LeaveRequestWhereInput = {};
  if (statusParam && statusParam in LeaveStatus) {
    where.status = statusParam as LeaveStatus;
  }

  if (!canAccessPosition(user, LEAVE_COORDINATION)) {
    if (!user.psychologistId) return Response.json([]);
    where.psychologistId = user.psychologistId;
  }

  const requests = await db.leaveRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: listInclude,
  });

  return Response.json(requests);
}

/**
 * POST /api/leave-requests — un psicólogo solicita un permiso.
 *
 * Queda en PENDING hasta que Coordinación Desarrollo Profesional la resuelva.
 * No bloquea agenda todavía: pedir un permiso no es tenerlo.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  // La solicitud cuelga de un perfil de psicólogo: es lo que permite bloquear
  // su agenda si se aprueba.
  if (!user.psychologistId) {
    return Response.json(
      { error: "Solo quien atiende pacientes puede solicitar permisos" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = leaveRequestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const created = await db.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: {
        psychologistId: user.psychologistId!,
        area: data.area,
        program: data.program,
        unit: data.unit,
        quantity: data.quantity,
        startDate: data.startDate,
        endDate: data.endDate,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        reason: data.reason,
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "LeaveRequest",
        entityId: leave.id,
        action: AuditAction.CREATE,
        changedFields: {
          unit: data.unit,
          quantity: data.quantity,
          startDate: data.startDate.toISOString(),
        },
      },
      tx,
    );

    await notifyPosition(
      LEAVE_COORDINATION,
      {
        type: NotificationType.LEAVE_REQUEST,
        title: "Nueva solicitud de permiso",
        message: `${user.name ?? "Un psicólogo"} solicita permiso: ${leaveRangeLabel(leave)}.`,
        relatedEntityId: leave.id,
      },
      tx,
    );

    return leave;
  });

  return Response.json(created, { status: 201 });
}
