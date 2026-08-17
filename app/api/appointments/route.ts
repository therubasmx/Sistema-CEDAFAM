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
  hasDeclaredSlot,
} from "@/lib/events";
import { notifyRole, createNotification, NotificationType } from "@/lib/notifications";
import { isRoomBlockedAt, roomLabels, MAX_CONCURRENT_APPOINTMENTS } from "@/lib/labels";
import { mxDayAndTime } from "@/lib/utils";

/**
 * POST /api/appointments — crea una cita.
 *
 * Para la mayoría de los roles esto es una **solicitud**: entra como PENDING
 * y espera la aprobación de la Recepción; el consultorio elegido es solo una
 * preferencia (no aparta el espacio hasta que se apruebe). Los psicólogos
 * solo pueden solicitar para sí mismos y no se permite solaparse con otra
 * cita propia ya activa.
 *
 * La Recepción es quien aprueba, así que cuando ella crea una cita no tiene
 * sentido pasar por PENDING (terminaría aprobándose a sí misma): su cita
 * queda agendada (SCHEDULED) de inmediato, con las mismas validaciones de
 * choque que usa la revisión de solicitudes.
 *
 * Reagendar una cita ya asistida (isReschedule) también se agenda directo:
 * no es una solicitud nueva, es mover una cita ya confirmada a otro horario.
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
  // Reagendar una cita ya asistida también se agenda directo, sin importar
  // el rol de quien la crea: no es una solicitud nueva, es mover una cita
  // ya confirmada a otro horario.
  const isDirectSchedule = user.role === Role.ACCOUNTANT || data.isReschedule === true;

  // El horario tiene que caer en un bloque que el psicólogo declaró
  // disponible en su reporte semanal — la misma regla que aplica la Recepción
  // al agendar una solicitud (PUT /api/appointments/[id]/review) y la que
  // muestra el selector de horarios. Si el psicólogo todavía no ha declarado
  // ningún bloque (nunca ha entregado un reporte) no se bloquea nada: si no,
  // no se le podría agendar en absoluto.
  const { dayOfWeek, time } = mxDayAndTime(start);
  if (!(await hasDeclaredSlot(data.psychologistId, dayOfWeek, time))) {
    return Response.json(
      { error: "El psicólogo no tiene disponibilidad a esa hora." },
      { status: 409 },
    );
  }
  // En coterapia el horario también tiene que caer en la disponibilidad del
  // coterapeuta: va a estar la hora completa en sesión igual que el titular.
  if (
    data.coTherapistId &&
    !(await hasDeclaredSlot(data.coTherapistId, dayOfWeek, time))
  ) {
    return Response.json(
      { error: "El coterapeuta no tiene disponibilidad a esa hora." },
      { status: 409 },
    );
  }

  // Bloqueo por evento interno que aplique a este psicólogo (junta o festivo
  // para todos, evento comunitario al que fue invitado, permiso aprobado…).
  const event = await findConflictingEvent(start, end, data.psychologistId);
  if (event) {
    return Response.json(
      { error: `Horario bloqueado por el evento: ${event.title}` },
      { status: 409 },
    );
  }

  // Solape con otra cita del psicólogo. Al agendar directo (Recepción) solo
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

  // El consultorio elegido (agendado directo o solo preferencia) no puede
  // chocar con otra cita ya confirmada: una solicitud PENDING no aparta el
  // espacio, pero si ya hay alguien confirmado ahí no tiene sentido dejarla
  // pedir — así el psicólogo se entera al solicitar, no la Recepción al
  // agendar.
  if (data.room) {
    if (isRoomBlockedAt(data.room, dayOfWeek, time, psychologist.speciality)) {
      return Response.json(
        { error: `${roomLabels[data.room]} no está disponible los jueves por la tarde.` },
        { status: 409 },
      );
    }
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
      // Avisar a la Recepción que hay una nueva solicitud por revisar.
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
