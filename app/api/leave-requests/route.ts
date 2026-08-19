import { type NextRequest } from "next/server";
import { LeaveStatus, Position, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { canViewPosition } from "@/lib/permissions";
import { leaveRequestCreateSchema } from "@/lib/validators";
import { NotificationType, notifyPosition } from "@/lib/notifications";
import { recordAudit, AuditAction } from "@/lib/audit";
import { leaveBlockRange, leaveRangeLabel } from "@/lib/leave";
import { hasLiveAppointmentInRange } from "@/lib/events";

const LEAVE_COORDINATION = Position.PROFESSIONAL_DEVELOPMENT;

/** Datos que necesita el módulo para pintar una solicitud. */
const listInclude = {
  // Quien solicita, siempre presente. `psychologist` solo existe si además
  // atiende pacientes (null para un Voluntario).
  user: { select: { name: true, email: true } },
  psychologist: {
    select: {
      id: true,
      speciality: true,
      workType: true,
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

  if (!canViewPosition(user, LEAVE_COORDINATION)) {
    where.userId = user.id;
  }

  const requests = await db.leaveRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: listInclude,
  });

  return Response.json(requests);
}

/**
 * POST /api/leave-requests — alguien del equipo solicita un permiso: quien
 * atiende pacientes (queda ligada a su perfil de psicólogo, lo que permite
 * bloquear su agenda si se aprueba) o un Voluntario (sin agenda que bloquear).
 *
 * Queda en PENDING hasta que Coordinación Desarrollo Profesional la resuelva.
 * No bloquea agenda todavía: pedir un permiso no es tenerlo.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  if (!user.psychologistId && user.role !== Role.VOLUNTEER) {
    return Response.json(
      { error: "Solo quien atiende pacientes o un Voluntario puede solicitar permisos" },
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

  // No se puede pedir permiso para un horario en el que ya hay una cita viva:
  // el psicólogo debe reagendarla o cancelarla primero. Un Voluntario no
  // tiene agenda propia, así que no hay nada que revisar.
  const { start: blockStart, end: blockEnd } = leaveBlockRange({
    unit: data.unit,
    startDate: data.startDate,
    endDate: data.endDate,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
  });
  const hasConflict = user.psychologistId
    ? await hasLiveAppointmentInRange(user.psychologistId, blockStart, blockEnd)
    : false;
  if (hasConflict) {
    return Response.json(
      {
        error:
          "Tienes una cita agendada en ese horario. Reagéndala o cancélala antes de solicitar este permiso.",
      },
      { status: 409 },
    );
  }

  const created = await db.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.create({
      data: {
        userId: user.id,
        psychologistId: user.psychologistId ?? null,
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
        message: `${user.name ?? "Alguien del equipo"} solicita permiso: ${leaveRangeLabel(leave)}.`,
        relatedEntityId: leave.id,
      },
      tx,
    );

    return leave;
  });

  return Response.json(created, { status: 201 });
}
