import { type NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { firstLiveAppointmentByPatient } from "@/lib/events";

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
    // Hard scope: solo sus propias citas, ya sea como psicólogo principal o
    // como coterapeuta invitado.
    if (!user.psychologistId) return Response.json([]);
    where.OR = [
      { psychologistId: user.psychologistId },
      { coTherapistId: user.psychologistId },
    ];
  } else if (psychologistId) {
    where.OR = [{ psychologistId }, { coTherapistId: psychologistId }];
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
      coTherapist: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  });

  // Primera cita del paciente en CEDAFAM vs. seguimiento (ver `lib/events.ts`).
  const firstByPatient = await firstLiveAppointmentByPatient([
    ...new Set(appointments.map((a) => a.patientId)),
  ]);
  const withVisitType = appointments.map((a) => ({
    ...a,
    isFirstVisit: firstByPatient.get(a.patientId) === a.scheduledAt.getTime(),
  }));

  return Response.json(withVisitType);
}
