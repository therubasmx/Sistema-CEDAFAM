import { type NextRequest } from "next/server";
import { Prisma, RoomBookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { roomAuthorizationSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { findRoomConflict } from "@/lib/events";
import { createNotification, NotificationType } from "@/lib/notifications";
import { roomLabels } from "@/lib/labels";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/appointments/[id]/room-authorization — coordinación/jefatura autoriza
 * o rechaza el consultorio de una cita pendiente. Al aprobar, revalida que el
 * consultorio siga libre. Notifica al psicólogo el resultado.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:authorizeRoom");
  if (guard instanceof Response) return guard;
  const actor = guard;
  const { id } = await params;

  const appt = await db.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { fullName: true } },
      psychologist: { select: { userId: true } },
    },
  });
  if (!appt) return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  if (!appt.room || appt.roomStatus !== RoomBookingStatus.PENDING) {
    return Response.json(
      { error: "Esta cita no tiene un consultorio pendiente de autorización" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = roomAuthorizationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { decision } = parsed.data;

  // Al aprobar, revalidar que nadie más haya tomado el consultorio.
  if (decision === RoomBookingStatus.APPROVED) {
    const end = new Date(appt.scheduledAt.getTime() + appt.duration * 60_000);
    const clash = await findRoomConflict(appt.room, appt.scheduledAt, end, appt.id);
    if (clash) {
      return Response.json(
        { error: `${roomLabels[appt.room]} ya fue reservado por otra cita a esa hora.` },
        { status: 409 },
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: {
        roomStatus: decision,
        roomAuthorizedById: actor.id,
        roomAuthorizedAt: new Date(),
      },
    });

    await recordAudit(
      {
        userId: actor.id,
        entityType: "Appointment",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: { roomStatus: decision } as Prisma.InputJsonValue,
      },
      tx,
    );

    const approved = decision === RoomBookingStatus.APPROVED;
    await createNotification(
      {
        userId: appt.psychologist.userId,
        type: NotificationType.ROOM_AUTH_RESULT,
        title: approved ? "Consultorio autorizado" : "Consultorio rechazado",
        message: `${roomLabels[appt.room!]} para ${appt.patient.fullName}: ${
          approved ? "autorizado" : "rechazado"
        }.`,
        relatedEntityId: id,
      },
      tx,
    );

    return result;
  });

  return Response.json(updated);
}
