import { type NextRequest } from "next/server";
import { AppointmentStatus, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { appointmentUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import {
  findConflictingEvent,
  findRoomConflict,
  findPsychologistConflict,
  countOverlappingAppointments,
  firstLiveAppointmentByPatient,
} from "@/lib/events";
import { notifyRole, NotificationType } from "@/lib/notifications";
import { roomLabels, MAX_CONCURRENT_APPOINTMENTS } from "@/lib/labels";

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
      coTherapist: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!appt)
    return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  if (
    user.role === Role.PSYCHOLOGIST &&
    appt.psychologistId !== user.psychologistId
  ) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  const firstByPatient = await firstLiveAppointmentByPatient([appt.patientId]);
  const isFirstVisit =
    firstByPatient.get(appt.patientId) === appt.scheduledAt.getTime();

  return Response.json({ ...appt, isFirstVisit });
}

// Estados de una cita ya confirmada, editables directamente (asistencia).
const CONFIRMED: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ATTENDED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.CANCELLED,
];

/**
 * PUT /api/appointments/[id] — actualiza una cita (reprogramar, notas,
 * asistencia) o reenvía una solicitud rechazada. Los psicólogos solo pueden
 * modificar las suyas. La aprobación/rechazo de solicitudes NO pasa por aquí,
 * sino por /review (Contadora).
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:create");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.appointment.findUnique({
    where: { id },
    include: { patient: { select: { fullName: true } } },
  });
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

  if (data.coTherapistId && data.coTherapistId === existing.psychologistId) {
    return Response.json(
      { error: "El coterapeuta debe ser distinto al psicólogo principal" },
      { status: 400 },
    );
  }
  if (data.coTherapistId) {
    const coTherapist = await db.psychologist.findUnique({
      where: { id: data.coTherapistId },
    });
    if (!coTherapist || !coTherapist.isActive) {
      return Response.json(
        { error: "Coterapeuta no disponible" },
        { status: 404 },
      );
    }
  }

  // Horario efectivo tras la edición.
  const start = data.scheduledAt ?? existing.scheduledAt;
  const duration = data.duration ?? existing.duration;
  const end = new Date(start.getTime() + duration * 60_000);
  const effCoTherapistId =
    data.coTherapistId !== undefined
      ? data.coTherapistId
      : existing.coTherapistId;

  // ── Transición de estado ────────────────────────────────────────────────
  // Reenviar solicitud (tras rechazo o para reproponer) la deja en PENDING.
  // Cancelar se permite siempre. La asistencia (ATTENDED/NO_SHOW/SCHEDULED)
  // solo se edita en citas ya confirmadas. Aprobar/rechazar va por /review.
  let finalStatus: AppointmentStatus = existing.status;
  let resent = false;
  if (data.resend) {
    if (
      existing.status === AppointmentStatus.REJECTED ||
      existing.status === AppointmentStatus.PENDING
    ) {
      finalStatus = AppointmentStatus.PENDING;
      resent = true;
    }
  } else if (data.status) {
    if (data.status === AppointmentStatus.CANCELLED) {
      finalStatus = AppointmentStatus.CANCELLED;
    } else if (
      (
        [
          AppointmentStatus.SCHEDULED,
          AppointmentStatus.ATTENDED,
          AppointmentStatus.NO_SHOW,
        ] as AppointmentStatus[]
      ).includes(data.status) &&
      CONFIRMED.includes(existing.status)
    ) {
      finalStatus = data.status;
    }
    // Cualquier otra transición (p. ej. auto-aprobar a SCHEDULED) se ignora.
  }

  const staysPending =
    finalStatus === AppointmentStatus.PENDING ||
    finalStatus === AppointmentStatus.REJECTED;

  // Edición de una solicitud que sigue PENDING (no reenvío, no cambio de
  // estado): la Contadora ya la tenía revisada, así que hay que avisarle que
  // vuelva a mirarla con los datos nuevos.
  const pendingEdited =
    !resent && existing.status === AppointmentStatus.PENDING;

  const timeChanged = !!(data.scheduledAt || data.duration);

  // Si se reprograma, validar contra eventos internos que bloqueen ese horario.
  if (timeChanged) {
    const event = await findConflictingEvent(
      start,
      end,
      existing.psychologistId,
    );
    if (event) {
      return Response.json(
        { error: `Horario bloqueado por el evento: ${event.title}` },
        { status: 409 },
      );
    }
  }

  // Coterapeuta: si queda asignado a una cita confirmada, su horario tampoco
  // puede chocar con un evento interno ni con otra cita suya ya confirmada.
  const coTherapistChanged =
    data.coTherapistId !== undefined &&
    data.coTherapistId !== existing.coTherapistId;
  if (
    effCoTherapistId &&
    !staysPending &&
    (timeChanged || coTherapistChanged)
  ) {
    const coEvent = await findConflictingEvent(start, end, effCoTherapistId);
    if (coEvent) {
      return Response.json(
        {
          error: `Horario del coterapeuta bloqueado por el evento: ${coEvent.title}`,
        },
        { status: 409 },
      );
    }
    const coClash = await findPsychologistConflict(
      effCoTherapistId,
      start,
      end,
      id,
    );
    if (coClash) {
      return Response.json(
        {
          error: "El coterapeuta ya tiene otra cita confirmada en ese horario.",
        },
        { status: 409 },
      );
    }
  }

  // Reenvío: mismo tope global que al crear una solicitud nueva, ya que
  // vuelve a agregar una solicitud activa a ese horario.
  if (resent) {
    const concurrent = await countOverlappingAppointments(start, end, id);
    if (concurrent >= MAX_CONCURRENT_APPOINTMENTS) {
      return Response.json(
        {
          error: `Ya hay ${MAX_CONCURRENT_APPOINTMENTS} solicitudes o citas activas en ese horario (el máximo de consultorios). No se pueden enviar más solicitudes para esa hora.`,
        },
        { status: 409 },
      );
    }
  }

  // Consultorio: en una solicitud es solo preferencia; en una cita confirmada
  // aparta el espacio, así que se revalida que siga libre.
  const effRoom = data.room !== undefined ? data.room : existing.room;
  const roomChanged = data.room !== undefined && data.room !== existing.room;
  if (effRoom && !staysPending && (roomChanged || timeChanged)) {
    const clash = await findRoomConflict(effRoom, start, end, id);
    if (clash) {
      return Response.json(
        {
          error: `${roomLabels[effRoom]} ya está reservado a esa hora por ${clash.psychologist.user.name}.`,
        },
        { status: 409 },
      );
    }
  }

  // No permitir que el spread de `data` pise campos calculados.
  const { room: _room, status: _status, resend: _resend, ...restData } = data;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: {
        ...restData,
        status: finalStatus,
        room: effRoom ?? null,
        // El flujo de autorización de consultorio de coordinación quedó retirado.
        roomStatus: null,
        roomAuthorizedById: null,
        roomAuthorizedAt: null,
        // Al reenviar, se limpia el motivo del rechazo anterior.
        ...(resent ? { rejectionReason: null } : {}),
        notes: data.notes === "" ? null : data.notes,
      },
    });

    // Reenvío → avisar a la Contadora de la nueva solicitud.
    if (resent) {
      const roomText = effRoom ? roomLabels[effRoom] : "Sin preferencia";
      await notifyRole(
        Role.ACCOUNTANT,
        {
          type: NotificationType.APPOINTMENT_REQUEST,
          title: "Solicitud de cita reenviada",
          message: `${roomText} el ${start.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })}.`,
          relatedEntityId: id,
        },
        tx,
      );
    } else if (pendingEdited) {
      const roomText = effRoom ? roomLabels[effRoom] : "Sin preferencia";
      await notifyRole(
        Role.ACCOUNTANT,
        {
          type: NotificationType.APPOINTMENT_REQUEST,
          title: "Solicitud de cita modificada",
          message: `${existing.patient.fullName} · ${roomText} el ${start.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })}. Vuelve a revisarla.`,
          relatedEntityId: id,
        },
        tx,
      );
    }

    await recordAudit(
      {
        userId: user.id,
        entityType: "Appointment",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: {
          ...data,
          status: finalStatus,
        } as Prisma.InputJsonValue,
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}
