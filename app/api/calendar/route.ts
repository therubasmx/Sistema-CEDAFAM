import { type NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/calendar?from=ISO&to=ISO&psychologistId=&patientId=
 * Returns appointments in the date range. Psychologists are scoped to their
 * own; admin/coordinator/accountant see all and may filter by psychologist or
 * patient.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const psychologistId = searchParams.get("psychologistId");
  const patientId = searchParams.get("patientId");

  const where: Prisma.AppointmentWhereInput = {};

  if (fromParam || toParam) {
    where.scheduledAt = {};
    if (fromParam) where.scheduledAt.gte = new Date(fromParam);
    if (toParam) where.scheduledAt.lte = new Date(toParam);
  }

  if (user.role === Role.PSYCHOLOGIST) {
    // Hard scope: only the psychologist's own appointments.
    if (!user.psychologistId) return Response.json([]);
    where.psychologistId = user.psychologistId;
  } else {
    if (psychologistId) where.psychologistId = psychologistId;
  }

  if (patientId) where.patientId = patientId;

  const appointments = await db.appointment.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    include: {
      patient: { select: { id: true, fullName: true } },
      psychologist: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  });

  return Response.json(appointments);
}
