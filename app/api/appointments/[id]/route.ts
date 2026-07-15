import { type NextRequest } from "next/server";
import { Prisma, Role, RoomBookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { appointmentUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { findConflictingEvent, findRoomConflict } from "@/lib/events";
import { notifyRole, NotificationType } from "@/lib/notifications";
import { roomLabels } from "@/lib/labels";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/appointments/[id] — single appointment with patient/psychologist.
 * Used to open a specific cita (e.g. from a notification). Psychologists may
 * only read their own.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const appt = await db.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, fullName: true } },
      psychologist: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!appt) return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  if (
    user.role === Role.PSYCHOLOGIST &&
    appt.psychologistId !== user.psychologistId
  ) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  return Response.json(appt);
}

/**
 * PUT /api/appointments/[id] — update an appointment (status, reschedule, notes).
 * Psychologists may only modify their own.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:create");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.appointment.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  }
  if (
    user.role === Role.PSYCHOLOGIST &&
    existing.psychologistId !== user.psychologistId
  ) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = appointmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Horario efectivo tras la edición.
  const start = data.scheduledAt ?? existing.scheduledAt;
  const duration = data.duration ?? existing.duration;
  const end = new Date(start.getTime() + duration * 60_000);

  // Si se reprograma, validar contra eventos internos que bloqueen ese horario.
  if (data.scheduledAt || data.duration) {
    const event = await findConflictingEvent(start, end);
    if (event) {
      return Response.json(
        { error: `Horario bloqueado por el evento: ${event.title}` },
        { status: 409 },
      );
    }
  }

  // Consultorio: recalcular reserva/estado si cambió el consultorio o el horario.
  const effRoom = data.room !== undefined ? data.room : existing.room;
  const roomChanged = data.room !== undefined && data.room !== existing.room;
  const timeChanged = !!(data.scheduledAt || data.duration);

  const roomFields: {
    room?: (typeof existing)["room"];
    roomStatus?: RoomBookingStatus | null;
    roomAuthorizedById?: string | null;
    roomAuthorizedAt?: Date | null;
  } = {};
  let notifyPendingRoom: (typeof existing)["room"] | null = null;

  if (effRoom && (roomChanged || timeChanged)) {
    const clash = await findRoomConflict(effRoom, start, end, id);
    if (clash) {
      return Response.json(
        { error: `${roomLabels[effRoom]} ya está reservado a esa hora por ${clash.psychologist.user.name}.` },
        { status: 409 },
      );
    }
  }

  if (roomChanged) {
    if (!effRoom) {
      // Se quitó el consultorio.
      roomFields.room = null;
      roomFields.roomStatus = null;
      roomFields.roomAuthorizedById = null;
      roomFields.roomAuthorizedAt = null;
    } else if (user.role === Role.PSYCHOLOGIST) {
      roomFields.room = effRoom;
      roomFields.roomStatus = RoomBookingStatus.PENDING;
      roomFields.roomAuthorizedById = null;
      roomFields.roomAuthorizedAt = null;
      notifyPendingRoom = effRoom;
    } else {
      roomFields.room = effRoom;
      roomFields.roomStatus = RoomBookingStatus.APPROVED;
      roomFields.roomAuthorizedById = user.id;
      roomFields.roomAuthorizedAt = new Date();
    }
  }

  // No permitir que el spread de `data` pise los campos de consultorio calculados.
  const { room: _ignoredRoom, ...restData } = data;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: {
        ...restData,
        ...roomFields,
        notes: data.notes === "" ? null : data.notes,
      },
    });

    if (notifyPendingRoom) {
      const notif = {
        type: NotificationType.ROOM_AUTH_REQUEST,
        title: "Autorización de consultorio",
        message: `${roomLabels[notifyPendingRoom]} el ${start.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })}. Solicita autorización.`,
        relatedEntityId: id,
      };
      await notifyRole(Role.COORDINATOR, notif, tx);
      await notifyRole(Role.ADMIN, notif, tx);
    }
    await recordAudit(
      {
        userId: user.id,
        entityType: "Appointment",
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
