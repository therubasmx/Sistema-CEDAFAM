import { type NextRequest } from "next/server";
import {
  AppointmentStatus,
  EventKind,
  EventScope,
  LeaveStatus,
  Position,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requirePosition } from "@/lib/api-auth";
import { leaveReviewSchema } from "@/lib/validators";
import { createNotification, NotificationType } from "@/lib/notifications";
import { recordAudit, AuditAction } from "@/lib/audit";
import { leaveBlockRange, leaveRangeLabel } from "@/lib/leave";
import { positionLabels } from "@/lib/labels";

type Params = { params: Promise<{ id: string }> };

const LEAVE_COORDINATION = Position.PROFESSIONAL_DEVELOPMENT;

/**
 * POST /api/leave-requests/[id]/review — aceptar o rechazar un permiso.
 *
 * Aceptar crea el bloqueo en el calendario: un CalendarEvent de tipo LEAVE con
 * alcance SELECTED e invitado único el psicólogo, de modo que a partir de ahí
 * `findConflictingEvent` impida agendarle pacientes en ese rango sin afectar a
 * nadie más. Rechazar una solicitud que ya estaba aprobada retira ese bloqueo.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requirePosition(LEAVE_COORDINATION);
  if (guard instanceof Response) return guard;
  const reviewer = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = leaveReviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { decision, note } = parsed.data;

  const leave = await db.leaveRequest.findUnique({
    where: { id },
    include: {
      psychologist: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  if (!leave) {
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const approving = decision === "APPROVE";
  if (approving && leave.status === LeaveStatus.APPROVED) {
    return Response.json({ error: "El permiso ya está aceptado" }, { status: 409 });
  }

  const rangeLabel = leaveRangeLabel(leave);
  const { start: blockStart, end: blockEnd } = leaveBlockRange(leave);

  // El bloqueo solo impide agendar *hacia adelante*: no cancela lo que ya
  // estaba en la agenda. Se cuentan esas citas para avisarle a la coordinación,
  // que es quien decide si aun así autoriza y se reprograma al paciente.
  const clashing = approving
    ? await db.appointment.count({
        where: {
          psychologistId: leave.psychologistId,
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.SCHEDULED] },
          scheduledAt: { gte: blockStart, lt: blockEnd },
        },
      })
    : 0;

  const updated = await db.$transaction(async (tx) => {
    // Un permiso que se rechaza después de haber sido aceptado debe liberar la
    // agenda que había cerrado.
    if (!approving && leave.calendarEventId) {
      await tx.calendarEvent.delete({ where: { id: leave.calendarEventId } });
    }

    let calendarEventId: string | null = approving ? leave.calendarEventId : null;

    if (approving) {
      const event = await tx.calendarEvent.create({
        data: {
          title: `Permiso — ${leave.psychologist.user.name}`,
          description: leave.reason,
          startAt: blockStart,
          endAt: blockEnd,
          coordination: positionLabels[LEAVE_COORDINATION],
          scope: EventScope.SELECTED,
          kind: EventKind.LEAVE,
          blocksAgenda: true,
          createdById: reviewer.id,
          attendees: { create: { psychologistId: leave.psychologistId } },
        },
      });
      calendarEventId = event.id;
    }

    const result = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: approving ? LeaveStatus.APPROVED : LeaveStatus.REJECTED,
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        reviewNote: note || null,
        calendarEventId,
      },
    });

    await recordAudit(
      {
        userId: reviewer.id,
        entityType: "LeaveRequest",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: { status: result.status, note: note ?? null },
      },
      tx,
    );

    await createNotification(
      {
        userId: leave.psychologist.userId,
        type: NotificationType.LEAVE_REQUEST_RESULT,
        title: approving ? "Permiso aceptado" : "Permiso rechazado",
        message: approving
          ? `Tu permiso del ${rangeLabel} fue aceptado. Ese horario queda bloqueado en tu agenda.`
          : `Tu permiso del ${rangeLabel} fue rechazado. Motivo: ${note}`,
        relatedEntityId: id,
      },
      tx,
    );

    return result;
  });

  return Response.json({ ...updated, clashingAppointments: clashing });
}
