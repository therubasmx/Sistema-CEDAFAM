import { type NextRequest } from "next/server";
import { AppointmentStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { findConflictingEvent, countOverlappingAppointments } from "@/lib/events";
import { notifyRole, NotificationType } from "@/lib/notifications";
import { roomLabels, MAX_CONCURRENT_APPOINTMENTS } from "@/lib/labels";

/**
 * POST /api/appointments — crea una **solicitud de cita**.
 *
 * Toda cita nueva entra como PENDING y espera la aprobación de la Contadora.
 * El consultorio elegido es solo una preferencia (no aparta el espacio hasta
 * que se apruebe). Los psicólogos solo pueden solicitar para sí mismos y no se
 * permite solaparse con otra cita propia ya activa.
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

  const [patient, psychologist] = await Promise.all([
    db.patient.findUnique({ where: { id: data.patientId } }),
    db.psychologist.findUnique({ where: { id: data.psychologistId } }),
  ]);
  if (!patient) return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  if (!psychologist || !psychologist.isActive) {
    return Response.json({ error: "Psicólogo no disponible" }, { status: 404 });
  }

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

  // Solape con otra cita propia del psicólogo que siga viva (no cancelada ni
  // rechazada). Las solicitudes rechazadas no bloquean; el psicólogo puede
  // reproponer.
  const sameDay = await db.appointment.findMany({
    where: {
      psychologistId: data.psychologistId,
      status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.REJECTED] },
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
      { error: "El psicólogo ya tiene una cita o solicitud en ese horario" },
      { status: 409 },
    );
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

  const appointment = await db.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        patientId: data.patientId,
        psychologistId: data.psychologistId,
        scheduledAt: data.scheduledAt,
        duration: data.duration,
        serviceType: data.serviceType,
        status: AppointmentStatus.PENDING,
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
          status: AppointmentStatus.PENDING,
        },
      },
      tx,
    );

    // Avisar a la Contadora que hay una nueva solicitud por revisar.
    const roomText = data.room ? roomLabels[data.room] : "Sin preferencia";
    await notifyRole(
      Role.ACCOUNTANT,
      {
        type: NotificationType.APPOINTMENT_REQUEST,
        title: "Nueva solicitud de cita",
        message: `${patient.fullName} · ${roomText} el ${data.scheduledAt.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" })}.`,
        relatedEntityId: created.id,
      },
      tx,
    );

    return created;
  });

  return Response.json(appointment, { status: 201 });
}
