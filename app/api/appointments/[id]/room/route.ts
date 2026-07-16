import { type NextRequest } from "next/server";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentRoomAssignSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { findRoomConflict } from "@/lib/events";
import { roomLabels, ROOM_DAILY_CAPACITY } from "@/lib/labels";
import { startOfMxDay, endOfMxDay } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

// Solo las citas confirmadas ocupan (y por tanto pueden asignar) consultorio.
const ASSIGNABLE: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ATTENDED,
];

/**
 * PUT /api/appointments/[id]/room — la Contadora asigna, mueve o libera el
 * consultorio de una cita agendada desde el tablero de Consultorios.
 *
 * Al asignar un consultorio (`room` no nulo) valida que:
 *   - no exista otra cita confirmada solapada en ese mismo consultorio, y
 *   - el consultorio no supere el máximo de pacientes del día.
 * Enviar `room: null` devuelve la cita al grupo de pacientes sin consultorio.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:assignRoom");
  if (guard instanceof Response) return guard;
  const actor = guard;
  const { id } = await params;

  const appt = await db.appointment.findUnique({ where: { id } });
  if (!appt) return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  if (!ASSIGNABLE.includes(appt.status)) {
    return Response.json(
      { error: "Solo las citas agendadas pueden asignarse a un consultorio." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = appointmentRoomAssignSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { room } = parsed.data;

  if (room) {
    const start = appt.scheduledAt;
    const end = new Date(start.getTime() + appt.duration * 60_000);

    // Otra cita confirmada solapada en el mismo consultorio.
    const clash = await findRoomConflict(room, start, end, id);
    if (clash) {
      return Response.json(
        {
          error: `${roomLabels[room]} ya está ocupado a esa hora por ${clash.psychologist.user.name} (${clash.patient.fullName}).`,
        },
        { status: 409 },
      );
    }

    // Tope diario de pacientes por consultorio (no cuenta si ya estaba aquí).
    if (room !== appt.room) {
      const dayCount = await db.appointment.count({
        where: {
          room,
          id: { not: id },
          status: { in: ASSIGNABLE },
          scheduledAt: {
            gte: startOfMxDay(start),
            lte: endOfMxDay(start),
          },
        },
      });
      if (dayCount >= ROOM_DAILY_CAPACITY) {
        return Response.json(
          {
            error: `${roomLabels[room]} ya tiene ${ROOM_DAILY_CAPACITY} pacientes ese día.`,
          },
          { status: 409 },
        );
      }
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.appointment.update({
      where: { id },
      data: { room },
    });
    await recordAudit(
      {
        userId: actor.id,
        entityType: "Appointment",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: { room } as Prisma.InputJsonValue,
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}
