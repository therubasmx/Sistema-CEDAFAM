import { type NextRequest } from "next/server";
import { AppointmentStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import {
  findConflictingEvent,
  findActiveAppointmentOverlap,
  findPsychologistConflict,
  findRoomConflict,
  countOverlappingAppointments,
} from "@/lib/events";
import { notifyRole, createNotification, NotificationType } from "@/lib/notifications";
import { roomLabels, MAX_CONCURRENT_APPOINTMENTS } from "@/lib/labels";

/**
 * POST /api/appointments — crea una cita.
 *
 * Para la mayoría de los roles esto es una **solicitud**: entra como PENDING
 * y espera la aprobación de la Contadora; el consultorio elegido es solo una
 * preferencia (no aparta el espacio hasta que se apruebe). Los psicólogos
 * solo pueden solicitar para sí mismos y no se permite solaparse con otra
 * cita propia ya activa.
 *
 * La Contadora es quien aprueba, así que cuando ella crea una cita no tiene
 * sentido pasar por PENDING (terminaría aprobándose a sí misma): su cita
 * queda agendada (SCHEDULED) de inmediato, con las mismas validaciones de
 * choque que usa la revisión de solicitudes.
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
      { error: "Solo puedes crear solicitudes para ti" },
      { status: 403 },
    );
  }

  if (data.coTherapistId && data.coTherapistId === data.psychologistId) {
    return Response.json(
      { error: "El coterapeuta debe ser distinto al psicólogo principal" },
      { status: 400 },
    );
  }

  const [patient, psychologist, coTherapist] = await Promise.all([
    db.patient.findUnique({ where: { id: data.patientId } }),
    db.psychologist.findUnique({ where: { id: data.psychologistId } }),
    data.coTherapistId
      ? db.psychologist.findUnique({ where: { id: data.coTherapistId } })
      : Promise.resolve(null),
  ]);
  if (!patient) return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  if (!psychologist || !psychologist.isActive) {
    return Response.json({ error: "Psicólogo no disponible" }, { status: 404 });
  }
  if (data.coTherapistId && (!coTherapist || !coTherapist.isActive)) {
    return Response.json({ error: "Coterapeuta no disponible" }, { status: 404 });
  }

  const start = data.scheduledAt;
  const end = new Date(start.getTime() + data.duration * 60_000);
  const isDirectSchedule = user.role === Role.ACCOUNTANT;

  // Bloqueo por evento interno que aplique a este psicólogo (junta o festivo
  // para todos, evento comunitario al que fue invitado, permiso aprobado…).
  const event = await findConflictingEvent(start, end, data.psychologistId);
  if (event) {
    return Response.json(
      { error: `Horario bloqueado por el evento: ${event.title}` },
      { status: 409 },
    );
  }

  // Solape con otra cita del psicólogo. Al agendar directo (Contadora) solo
  // importan las citas ya confirmadas, igual que al aprobar una solicitud;
  // para el resto de roles cuenta también cualquier solicitud viva propia
  // (no cancelada ni rechazada), ya que las rechazadas no bloquean y el
  // psicólogo puede reproponer.
  const overlap = isDirectSchedule
    ? await findPsychologistConflict(data.psychologistId, start, end)
    : await findActiveAppointmentOverlap(data.psychologistId, start, end);
  if (overlap) {
    return Response.json(
      { error: "El psicólogo ya tiene una cita o solicitud en ese horario" },
      { status: 409 },
    );
  }

  if (data.coTherapistId) {
    const coEvent = await findConflictingEvent(start, end, data.coTherapistId);
    if (coEvent) {
      return Response.json(
        { error: `Horario del coterapeuta bloqueado por el evento: ${coEvent.title}` },
        { status: 409 },
      );
    }
    const coOverlap = isDirectSchedule
      ? await findPsychologistConflict(data.coTherapistId, start, end)
      : await findActiveAppointmentOverlap(data.coTherapistId, start, end);
    if (coOverlap) {
      return Response.json(
        { error: "El coterapeuta ya tiene una cita o solicitud en ese horario" },
        { status: 409 },
      );
    }
  }

  // Al agendar directo el consultorio (si se eligió) sí aparta el espacio,
  // así que hay que revisar que no choque con otra cita confirmada.
  if (isDirectSchedule && data.room) {
    const roomClash = await findRoomConflict(data.room, start, end);
    if (roomClash) {
      return Response.json(
        {
          error: `${roomLabels[data.room]} ya está reservado a esa hora por ${roomClash.psychologist.user.name}.`,
        },
        { status: 409 },
      );
    }
  }

  // Tope global: no puede haber más solicitudes/citas activas solapadas en
  // ese horario que consultorios físicos existen, sin importar el psicólogo.
  const concurrent = await countOverlappingAppointments(start, end);
  if (concurrent >= MAX_CONCURRENT_APPOINTMENTS) {
    return Response.json(
      {
        error: `Ya hay ${MAX_CONCURRENT_APPOINTMENTS} solicitudes o citas activas en ese horario (el máximo de consultorios). No se pueden enviar más solicitudes para esa hora.`,
      },
      { status: 409 },
    );
  }

  const status = isDirectSchedule ? AppointmentStatus.SCHEDULED : AppointmentStatus.PENDING;

  const appointment = await db.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        patientId: data.patientId,
        psychologistId: data.psychologistId,
        coTherapistId: data.coTherapistId ?? null,
        scheduledAt: data.scheduledAt,
        duration: data.duration,
        serviceType: data.serviceType,
        status,
        room: data.room ?? null,
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
          status,
        },
      },
      tx,
    );

    const whenText = data.scheduledAt.toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    });
    if (isDirectSchedule) {
      // Avisar al psicólogo que se le agendó una cita confirmada.
      await createNotification(
        {
          userId: psychologist.userId,
          type: NotificationType.APPOINTMENT_REQUEST_RESULT,
          title: "Cita agendada",
          message: `La cita de ${patient.fullName} fue agendada para el ${whenText}.`,
          relatedEntityId: created.id,
        },
        tx,
      );
    } else {
      // Avisar a la Contadora que hay una nueva solicitud por revisar.
      const roomText = data.room ? roomLabels[data.room] : "Sin preferencia";
      await notifyRole(
        Role.ACCOUNTANT,
        {
          type: NotificationType.APPOINTMENT_REQUEST,
          title: "Nueva solicitud de cita",
          message: `${patient.fullName} · ${roomText} el ${whenText}.`,
          relatedEntityId: created.id,
        },
        tx,
      );
    }

    return created;
  });

  return Response.json(appointment, { status: 201 });
}
