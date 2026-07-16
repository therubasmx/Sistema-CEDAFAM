import { type NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { countOverlappingAppointments } from "@/lib/events";
import { MAX_CONCURRENT_APPOINTMENTS } from "@/lib/labels";

/**
 * GET /api/appointments/slot-capacity?scheduledAt=ISO&duration=60&excludeId=
 *
 * Cuántas solicitudes/citas activas ya ocupan ese horario en toda la
 * clínica, para avisarle al psicólogo ANTES de enviar si ya se llegó al
 * máximo (una por consultorio). Es solo una ayuda en vivo para el
 * formulario; la validación autoritativa vive en POST /api/appointments y
 * PUT /api/appointments/[id] (reenvío).
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("appointments:create");
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const start = new Date(searchParams.get("scheduledAt") ?? "");
  const duration = Number(searchParams.get("duration"));
  const excludeId = searchParams.get("excludeId") ?? undefined;

  if (Number.isNaN(start.getTime()) || !Number.isFinite(duration) || duration <= 0) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const end = new Date(start.getTime() + duration * 60_000);

  const count = await countOverlappingAppointments(start, end, excludeId);
  return Response.json({
    count,
    limit: MAX_CONCURRENT_APPOINTMENTS,
    full: count >= MAX_CONCURRENT_APPOINTMENTS,
  });
}
