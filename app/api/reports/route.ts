import { type NextRequest } from "next/server";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth";
import { buildReport, buildPsychologistReport } from "@/lib/reports";
import { parseDateRange } from "@/lib/report-range";

/** GET /api/reports?start=YYYY-MM-DD&end=YYYY-MM-DD — report data as JSON. Both dates inclusive. */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("reports:read");
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams.get("start"), searchParams.get("end"));
  if (!range) {
    return Response.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }

  const endExclusive = addDays(range.end, 1);
  const [report, psychologists] = await Promise.all([
    buildReport(range.start, endExclusive),
    buildPsychologistReport(range.start, endExclusive),
  ]);
  return Response.json({ ...report, psychologists });
}
