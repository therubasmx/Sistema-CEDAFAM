import { type NextRequest } from "next/server";
import { AppointmentStatus, LeaveStatus, Position } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePosition } from "@/lib/api-auth";
import { leaveRequestCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { leaveBlockRange } from "@/lib/leave";

type Params = { params: Promise<{ id: string }> };

const LEAVE_COORDINATION = Position.PROFESSIONAL_DEVELOPMENT;

/**
 * PATCH /api/leave-requests/[id] — Coordinación Desarrollo Profesional corrige
 * una solicitud sin que quien la pidió tenga que enviar otra.
 *
 * Si la solicitud ya estaba aprobada, mueve también el bloqueo del calendario
 * (y el evento informativo de quien la revisó, si existe) al rango corregido.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePosition(LEAVE_COORDINATION);
  if (guard instanceof Response) return guard;
  const { id } = await params;

  const leave = await db.leaveRequest.findUnique({
    where: { id },
    include: {
      psychologist: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!leave) {
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
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
  const startTime = data.startTime || null;
  const endTime = data.endTime || null;

  const { start: blockStart, end: blockEnd } = leaveBlockRange({
    unit: data.unit,
    startDate: data.startDate,
    endDate: data.endDate,
    startTime,
    endTime,
  });

  const clashing =
    leave.status === LeaveStatus.APPROVED
      ? await db.appointment.count({
          where: {
            psychologistId: leave.psychologistId,
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.SCHEDULED] },
            scheduledAt: { gte: blockStart, lt: blockEnd },
          },
        })
      : 0;

  const updated = await db.$transaction(async (tx) => {
    if (leave.status === LeaveStatus.APPROVED) {
      if (leave.calendarEventId) {
        await tx.calendarEvent.update({
          where: { id: leave.calendarEventId },
          data: { startAt: blockStart, endAt: blockEnd, description: data.reason },
        });
      }
      if (leave.reviewerCalendarEventId) {
        await tx.calendarEvent.update({
          where: { id: leave.reviewerCalendarEventId },
          data: { startAt: blockStart, endAt: blockEnd, description: data.reason },
        });
      }
    }

    const result = await tx.leaveRequest.update({
      where: { id },
      data: {
        area: data.area,
        program: data.program,
        unit: data.unit,
        quantity: data.quantity,
        startDate: data.startDate,
        endDate: data.endDate,
        startTime,
        endTime,
        reason: data.reason,
      },
    });

    await recordAudit(
      {
        userId: guard.id,
        entityType: "LeaveRequest",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: {
          startDate: data.startDate.toISOString(),
          endDate: data.endDate.toISOString(),
          startTime,
          endTime,
        },
      },
      tx,
    );

    return result;
  });

  return Response.json({ ...updated, clashingAppointments: clashing });
}

/**
 * DELETE /api/leave-requests/[id] — Coordinación Desarrollo Profesional borra
 * una solicitud por completo (p. ej. se capturó por error). Si estaba
 * aprobada, libera también el bloqueo del calendario y el evento informativo
 * de quien la revisó.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requirePosition(LEAVE_COORDINATION);
  if (guard instanceof Response) return guard;
  const { id } = await params;

  const leave = await db.leaveRequest.findUnique({ where: { id } });
  if (!leave) {
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    await tx.leaveRequest.delete({ where: { id } });

    if (leave.calendarEventId) {
      await tx.calendarEvent.delete({ where: { id: leave.calendarEventId } });
    }
    if (leave.reviewerCalendarEventId) {
      await tx.calendarEvent.delete({ where: { id: leave.reviewerCalendarEventId } });
    }

    await recordAudit(
      {
        userId: guard.id,
        entityType: "LeaveRequest",
        entityId: id,
        action: AuditAction.DELETE,
      },
      tx,
    );
  });

  return Response.json({ ok: true });
}
