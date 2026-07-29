import { type NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { leaveConflictQuerySchema } from "@/lib/validators";
import { leaveBlockRange } from "@/lib/leave";
import { hasLiveAppointmentInRange } from "@/lib/events";

/**
 * GET /api/leave-requests/conflicts?unit=&startDate=&endDate=&startTime=&endTime=
 *
 * El formulario de "Solicitar permiso" llama esto mientras el psicólogo llena
 * la fecha/horario, para avisarle de inmediato si ya tiene una cita agendada
 * ahí y evitar que mande una solicitud que Coordinación tendría que rechazar.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  if (!user.psychologistId) return Response.json({ hasConflict: false });

  const { searchParams } = new URL(req.url);
  const parsed = leaveConflictQuerySchema.safeParse({
    unit: searchParams.get("unit"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    startTime: searchParams.get("startTime"),
    endTime: searchParams.get("endTime"),
  });
  if (!parsed.success) return Response.json({ hasConflict: false });

  const data = parsed.data;
  const { start, end } = leaveBlockRange({
    unit: data.unit,
    startDate: data.startDate,
    endDate: data.endDate,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
  });

  const hasConflict = await hasLiveAppointmentInRange(user.psychologistId, start, end);
  return Response.json({ hasConflict });
}
