import { type NextRequest } from "next/server";
import { AppointmentStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

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

  const appointment = await db.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        patientId: data.patientId,
        psychologistId: data.psychologistId,
        scheduledAt: data.scheduledAt,
        duration: data.duration,
        serviceType: data.serviceType,
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
        },
      },
      tx,
    );
    return created;
  });

  return Response.json(appointment, { status: 201 });
}
