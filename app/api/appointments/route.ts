import { type NextRequest } from "next/server";
import { AppointmentStatus, Role, RoomBookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { findConflictingEvent, findRoomConflict } from "@/lib/events";
import { notifyRole, NotificationType } from "@/lib/notifications";
import { roomLabels } from "@/lib/labels";

/**
 * POST /api/appointments — create an appointment.
 * Psychologists may only create for themselves. Rejects overlaps with the
 * psychologist's other active (non-cancelled) appointments.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("appointments:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = appointmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (user.role === Role.PSYCHOLOGIST && data.psychologistId !== user.psychologistId) {
    return Response.json(
      { error: "Solo puedes crear citas para ti" },
      { status: 403 },
    );
  }

  const [patient, psychologist] = await Promise.all([
    db.patient.findUnique({ where: { id: data.patientId } }),
    db.psychologist.findUnique({ where: { id: data.psychologistId } }),
  ]);
  if (!patient) return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  if (!psychologist || !psychologist.isActive) {
    return Response.json({ error: "Psicólogo no disponible" }, { status: 404 });
  }

  // Overlap check: [start, end) against existing non-cancelled appointments.
  const start = data.scheduledAt;
  const end = new Date(start.getTime() + data.duration * 60_000);

  // Bloqueo por evento interno global (juntas, festivos, etc.).
  const event = await findConflictingEvent(start, end);
  if (event) {
    return Response.json(
      { error: `Horario bloqueado por el evento: ${event.title}` },
      { status: 409 },
    );
  }

  const sameDay = await db.appointment.findMany({
    where: {
      psychologistId: data.psychologistId,
      status: { not: AppointmentStatus.CANCELLED },
      scheduledAt: {
        gte: new Date(start.getTime() - 8 * 60 * 60_000),
        lte: end,
      },
    },
  });
  const overlaps = sameDay.some((a) => {
    const aStart = a.scheduledAt.getTime();
    const aEnd = aStart + a.duration * 60_000;
    return aStart < end.getTime() && start.getTime() < aEnd;
  });
  if (overlaps) {
    return Response.json(
      { error: "El psicólogo ya tiene una cita en ese horario" },
      { status: 409 },
    );
  }

  // Consultorio: chequear que no esté reservado y definir estado de autorización.
  // Psicólogo → PENDIENTE (coordinación debe autorizar). Jefatura/coordinación
  // → APROBADO directo.
  let roomStatus: RoomBookingStatus | null = null;
  let roomAuthorizedById: string | null = null;
  let roomAuthorizedAt: Date | null = null;
  if (data.room) {
    const clash = await findRoomConflict(data.room, start, end);
    if (clash) {
      return Response.json(
        {
          error: `${roomLabels[data.room]} ya está reservado a esa hora por ${clash.psychologist.user.name}.`,
        },
        { status: 409 },
      );
    }
    if (user.role === Role.PSYCHOLOGIST) {
      roomStatus = RoomBookingStatus.PENDING;
    } else {
      roomStatus = RoomBookingStatus.APPROVED;
      roomAuthorizedById = user.id;
      roomAuthorizedAt = new Date();
    }
  }

  const appointment = await db.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        patientId: data.patientId,
        psychologistId: data.psychologistId,
        scheduledAt: data.scheduledAt,
        duration: data.duration,
        serviceType: data.serviceType,
        room: data.room ?? null,
        roomStatus,
        roomAuthorizedById,
        roomAuthorizedAt,
        notes: data.notes || null,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "Appointment",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: {
          patientId: data.patientId,
          scheduledAt: data.scheduledAt.toISOString(),
          room: data.room ?? undefined,
        },
      },
      tx,
    );

    // Solicitud de autorización → avisar a coordinación y jefatura.
    if (roomStatus === RoomBookingStatus.PENDING && data.room) {
      const notif = {
        type: NotificationType.ROOM_AUTH_REQUEST,
        title: "Autorización de consultorio",
        message: `${patient.fullName} · ${roomLabels[data.room]} el ${data.scheduledAt.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })}. Solicita autorización.`,
        relatedEntityId: created.id,
      };
      await notifyRole(Role.COORDINATOR, notif, tx);
      await notifyRole(Role.ADMIN, notif, tx);
    }

    return created;
  });

  return Response.json(appointment, { status: 201 });
}
