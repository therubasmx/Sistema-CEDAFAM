import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { availabilityUpdateSchema } from "@/lib/validators";
import { slotTimes } from "@/lib/week";

type Params = { params: Promise<{ id: string }> };

/** GET /api/psychologists/[id]/availability — active availability blocks. */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const { id } = await params;

  const blocks = await db.psychologistAvailability.findMany({
    where: { psychologistId: id, isActive: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return Response.json(blocks);
}

/**
 * PUT /api/psychologists/[id]/availability — replace availability.
 * Only the psychologist themselves or an admin/coordinator may edit.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const isOwner = user.role === Role.PSYCHOLOGIST && user.psychologistId === id;
  const isManager = user.role === Role.ADMIN || user.role === Role.COORDINATOR;
  if (!isOwner && !isManager) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = availabilityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await db.$transaction(async (tx) => {
    await tx.psychologistAvailability.deleteMany({ where: { psychologistId: id } });
    if (parsed.data.blocks.length > 0) {
      await tx.psychologistAvailability.createMany({
        data: parsed.data.blocks.map((b) => {
          const { startTime, endTime } = slotTimes(b.slot);
          return { psychologistId: id, dayOfWeek: b.dayOfWeek, startTime, endTime };
        }),
      });
    }
  });

  const blocks = await db.psychologistAvailability.findMany({
    where: { psychologistId: id, isActive: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return Response.json(blocks);
}
