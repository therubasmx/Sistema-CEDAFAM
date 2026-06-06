import { type NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { buildAnnualReport } from "@/lib/reports";

/** GET /api/reports/annual?year=YYYY — the five annual reports as JSON. */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("reports:read");
  if (guard instanceof Response) return guard;

  const yearParam = new URL(req.url).searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year)) {
    return Response.json({ error: "Año inválido" }, { status: 400 });
  }

  const report = await buildAnnualReport(year);
  return Response.json(report);
}
