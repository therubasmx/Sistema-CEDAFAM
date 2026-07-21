import { type NextRequest } from "next/server";
import { Position } from "@prisma/client";
import { requirePosition } from "@/lib/api-auth";
import { buildCoordinationSummaries } from "@/lib/coordination-summary";
import { parseRange } from "@/lib/survey-report";

/**
 * GET /api/coordination-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Resumen de las otras cinco coordinaciones, para Servicios de Atención
 * Privada. Sin rango, cubre todo el histórico.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePosition(Position.PRIVATE_CARE_SERVICES);
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const { from, to } = parseRange(searchParams);

  return Response.json(await buildCoordinationSummaries(from, to));
}
