import { type NextRequest } from "next/server";
import { Position } from "@prisma/client";
import { requireViewPosition } from "@/lib/api-auth";
import { buildSurveyReport, parseRange } from "@/lib/survey-report";

/**
 * GET /api/surveys?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Resultados agregados de la encuesta, para el módulo de Innovación e
 * Investigación. Sin rango, cubre todo el histórico.
 */
export async function GET(req: NextRequest) {
  const guard = await requireViewPosition(Position.INNOVATION_RESEARCH);
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const { from, to } = parseRange(searchParams);

  return Response.json(await buildSurveyReport(from, to));
}
