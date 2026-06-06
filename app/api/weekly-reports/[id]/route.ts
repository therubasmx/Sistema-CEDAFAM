import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

/** GET /api/weekly-reports/[id] — full report with patient updates. */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const report = await db.weeklyReport.findUnique({
    where: { id },
    include: {
      psychologist: { include: { user: { select: { name: true } } } },
      patientUpdates: {
        include: { patient: { select: { fullName: true } } },
      },
    },
  });

  if (!report) {
    return Response.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (
    user.role === Role.PSYCHOLOGIST &&
    report.psychologistId !== user.psychologistId
  ) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  return Response.json(report);
}
