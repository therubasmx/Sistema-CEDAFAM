import { type NextRequest } from "next/server";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentReviewSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import {
  findConflictingEvent,
  findRoomConflict,
  findPsychologistConflict,
  countOverlappingAppointments,
} from "@/lib/events";
import { createNotification, NotificationType } from "@/lib/notifications";
import { roomLabels, MAX_CONCURRENT_APPOINTMENTS } from "@/lib/labels";
import { mxDayAndTime } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/appointments/[id]/review — la Contadora acepta o rechaza una
 * solicitud de cita pendiente.
 *
 *  - Aceptar → la cita pasa a SCHEDULED (revalidando que no choque con un
 *    evento interno ni con otra cita confirmada en el mismo consultorio).
 *  - Rechazar → la cita pasa a REJECTED con el motivo indicado.
 *
 * En ambos casos se notifica al psicólogo el resultado.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:review");
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
  if (!appt) return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  // La Contadora puede accionar sobre solicitudes pendientes y también sobre las
  // ya rechazadas (aceptarlas, agendarlas o rechazarlas de nuevo).
  if (
    appt.status !== AppointmentStatus.PENDING &&
    appt.status !== AppointmentStatus.REJECTED
  ) {
    return Response.json(
      { error: "Esta solicitud ya fue revisada" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = appointmentReviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors.note?.[0] ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const { decision, note } = data;

  // Valores efectivos de la cita según la decisión. ACCEPT y REJECT conservan el
  // horario propuesto; SCHEDULE fija uno nuevo confirmado por la Contadora
  // (y puede ajustar duración, servicio, consultorio y notas).
  let start = appt.scheduledAt;
  let duration = appt.duration;
  let serviceType = appt.serviceType;
  let room = appt.room;
  let notes = appt.notes;
  if (decision === "SCHEDULE") {
    start = data.scheduledAt!; // garantizado por el schema
    duration = data.duration ?? appt.duration;
    serviceType = data.serviceType ?? appt.serviceType;
    room = data.room !== undefined ? data.room : appt.room;
    notes = data.notes !== undefined ? data.notes || null : appt.notes;
  }
  const end = new Date(start.getTime() + duration * 60_000);

  // ── Validaciones de horario (aceptar o agendar) ───────────────────────────
  if (decision === "ACCEPT" || decision === "SCHEDULE") {
    // Al agendar directo, el horario elegido debe caer dentro de la
    // disponibilidad que el psicólogo declaró: es la validación autoritativa
    // del selector de horarios del formulario.
    if (decision === "SCHEDULE") {
      const { dayOfWeek, time } = mxDayAndTime(start);
      const block = await db.psychologistAvailability.findFirst({
        where: {
          psychologistId: appt.psychologistId,
          dayOfWeek,
          startTime: time,
          isActive: true,
        },
      });
      if (!block) {
        return Response.json(
          { error: "El psicólogo no tiene disponibilidad a esa hora." },
          { status: 409 },
        );
      }
    }

    const event = await findConflictingEvent(start, end, appt.psychologistId);
    if (event) {
      return Response.json(
        { error: `Horario bloqueado por el evento: ${event.title}` },
        { status: 409 },
      );
    }

    // Otra cita confirmada del mismo psicólogo a esa hora.
    const psyClash = await findPsychologistConflict(appt.psychologistId, start, end, id);
    if (psyClash) {
      return Response.json(
        { error: "El psicólogo ya tiene otra cita confirmada en ese horario." },
        { status: 409 },
      );
    }

    // Agendar mueve la cita a un horario nuevo, así que revalida el tope global
    // de consultorios; aceptar conserva el horario ya contabilizado al crearse.
    if (decision === "SCHEDULE") {
      const concurrent = await countOverlappingAppointments(start, end, id);
      if (concurrent >= MAX_CONCURRENT_APPOINTMENTS) {
        return Response.json(
          {
            error: `Ya hay ${MAX_CONCURRENT_APPOINTMENTS} citas activas en ese horario (el máximo de consultorios). Elige otro horario.`,
          },
          { status: 409 },
        );
      }
    }

    // Consultorio (si lo hay) libre entre citas confirmadas.
    if (room) {
      const clash = await findRoomConflict(room, start, end, id);
      if (clash) {
        return Response.json(
          { error: `${roomLabels[room]} ya está reservado a esa hora por ${clash.psychologist.user.name}.` },
          { status: 409 },
        );
      }
    }
  }

  const accepted = decision !== "REJECT";
  const nextStatus = accepted
    ? AppointmentStatus.SCHEDULED
    : AppointmentStatus.REJECTED;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: {
        status: nextStatus,
        rejectionReason: decision === "REJECT" ? note : null,
        ...(decision === "SCHEDULE"
          ? {
              scheduledAt: start,
              duration,
              serviceType,
              room: room ?? null,
              notes,
              // El flujo de autorización de consultorio quedó retirado.
              roomStatus: null,
              roomAuthorizedById: null,
              roomAuthorizedAt: null,
            }
          : {}),
      },
    });

    await recordAudit(
      {
        userId: actor.id,
        entityType: "Appointment",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: {
          status: nextStatus,
          ...(decision === "REJECT" ? { rejectionReason: note } : {}),
          ...(decision === "SCHEDULE"
            ? { scheduledAt: start.toISOString(), duration, room: room ?? undefined }
            : {}),
        } as Prisma.InputJsonValue,
      },
      tx,
    );

    const whenText = start.toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    });
    await createNotification(
      {
        userId: appt.psychologist.userId,
        type: NotificationType.APPOINTMENT_REQUEST_RESULT,
        title:
          decision === "REJECT"
            ? "Solicitud de cita rechazada"
            : decision === "SCHEDULE"
              ? "Cita agendada"
              : "Solicitud de cita aceptada",
        message:
          decision === "REJECT"
            ? `La solicitud de ${appt.patient.fullName} fue rechazada: ${note}`
            : decision === "SCHEDULE"
              ? `La cita de ${appt.patient.fullName} fue agendada para el ${whenText}.`
              : `La cita de ${appt.patient.fullName} fue agendada.`,
        relatedEntityId: id,
      },
      tx,
    );

    return result;
  });

  return Response.json(updated);
}
