import { type NextRequest } from "next/server";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentReviewSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { findConflictingEvent, findRoomConflict } from "@/lib/events";
import { createNotification, NotificationType } from "@/lib/notifications";
import { roomLabels } from "@/lib/labels";

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
  if (appt.status !== AppointmentStatus.PENDING) {
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
  const { decision, note } = parsed.data;

  // ── Aceptar ───────────────────────────────────────────────────────────────
  if (decision === "ACCEPT") {
    const start = appt.scheduledAt;
    const end = new Date(start.getTime() + appt.duration * 60_000);

    const event = await findConflictingEvent(start, end);
    if (event) {
      return Response.json(
        { error: `Horario bloqueado por el evento: ${event.title}` },
        { status: 409 },
      );
    }

    // Otra cita confirmada del mismo psicólogo a esa hora.
    const psySame = await db.appointment.findMany({
      where: {
        psychologistId: appt.psychologistId,
        id: { not: id },
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] },
        scheduledAt: {
          gte: new Date(start.getTime() - 8 * 60 * 60_000),
          lte: end,
        },
      },
    });
    const psyOverlap = psySame.some((a) => {
      const aStart = a.scheduledAt.getTime();
      const aEnd = aStart + a.duration * 60_000;
      return aStart < end.getTime() && start.getTime() < aEnd;
    });
    if (psyOverlap) {
      return Response.json(
        { error: "El psicólogo ya tiene otra cita confirmada en ese horario." },
        { status: 409 },
      );
    }

    // Consultorio (si lo hay) libre entre citas confirmadas.
    if (appt.room) {
      const clash = await findRoomConflict(appt.room, start, end, id);
      if (clash) {
        return Response.json(
          { error: `${roomLabels[appt.room]} ya está reservado a esa hora por ${clash.psychologist.user.name}.` },
          { status: 409 },
        );
      }
    }
  }

  const nextStatus =
    decision === "ACCEPT" ? AppointmentStatus.SCHEDULED : AppointmentStatus.REJECTED;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: {
        status: nextStatus,
        rejectionReason: decision === "REJECT" ? note : null,
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
        } as Prisma.InputJsonValue,
      },
      tx,
    );

    const accepted = decision === "ACCEPT";
    await createNotification(
      {
        userId: appt.psychologist.userId,
        type: NotificationType.APPOINTMENT_REQUEST_RESULT,
        title: accepted ? "Solicitud de cita aceptada" : "Solicitud de cita rechazada",
        message: accepted
          ? `La cita de ${appt.patient.fullName} fue agendada.`
          : `La solicitud de ${appt.patient.fullName} fue rechazada: ${note}`,
        relatedEntityId: id,
      },
      tx,
    );

    return result;
  });

  return Response.json(updated);
}
