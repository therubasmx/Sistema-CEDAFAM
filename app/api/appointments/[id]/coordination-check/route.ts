import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { appointmentCoordinationCheckSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/appointments/[id]/coordination-check — marca/desmarca la casilla
 * del checklist de Coordinación en el dashboard (citas de hoy registradas
 * por los psicólogos). No cambia el estado de la cita, solo deja constancia
 * de quién la revisó y cuándo.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("appointments:coordinationCheck");
  if (guard instanceof Response) return guard;
  const actor = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = appointmentCoordinationCheckSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const appt = await db.appointment.findUnique({ where: { id } });
  if (!appt) return Response.json({ error: "Cita no encontrada" }, { status: 404 });

  const updated = await db.appointment.update({
    where: { id },
    data: parsed.data.checked
      ? { coordinationCheckedAt: new Date(), coordinationCheckedById: actor.id }
      : { coordinationCheckedAt: null, coordinationCheckedById: null },
  });

  return Response.json(updated);
}
