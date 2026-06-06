import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

/** GET /api/patients/[id]/history — status history + appointments timeline. */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  if (user.role === Role.PSYCHOLOGIST) {
    const mine = await db.patientAssignment.findFirst({
      where: { patientId: id, psychologistId: user.psychologistId ?? "", isActive: true },
    });
    if (!mine) return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  const [statuses, appointments] = await Promise.all([
    db.patientStatus.findMany({
      where: { patientId: id },
      include: { changedBy: { select: { name: true } } },
      orderBy: { changedAt: "desc" },
    }),
    db.appointment.findMany({
      where: { patientId: id },
      include: { psychologist: { include: { user: { select: { name: true } } } } },
      orderBy: { scheduledAt: "desc" },
    }),
  ]);

  return Response.json({ statuses, appointments });
}
