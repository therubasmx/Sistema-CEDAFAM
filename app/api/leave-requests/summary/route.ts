import { type NextRequest } from "next/server";
import { LeaveStatus, LeaveUnit, Position } from "@prisma/client";
import { db } from "@/lib/db";
import { requireViewPosition } from "@/lib/api-auth";

const LEAVE_COORDINATION = Position.PROFESSIONAL_DEVELOPMENT;

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export interface LeaveSummaryRow {
  psychologistId: string;
  name: string;
  pending: number;
  approved: number;
  rejected: number;
  /** Horas y días aprobados, para ver cuánto se ausenta cada quien. */
  approvedHours: number;
  approvedDays: number;
}

export interface LeaveMonthRow {
  month: string;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * GET /api/leave-requests/summary?year=YYYY
 *
 * Conteos del tablero de Coordinación Desarrollo Profesional: totales por
 * estado, desglose mensual del año y acumulado por psicólogo.
 */
export async function GET(req: NextRequest) {
  const guard = await requireViewPosition(LEAVE_COORDINATION);
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? "", 10) || new Date().getFullYear();
  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);

  const [totals, inYear, earliest] = await Promise.all([
    db.leaveRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    db.leaveRequest.findMany({
      where: { startDate: { gte: from, lt: to } },
      select: {
        status: true,
        unit: true,
        quantity: true,
        startDate: true,
        psychologistId: true,
        psychologist: { select: { user: { select: { name: true } } } },
      },
    }),
    db.leaveRequest.findFirst({
      orderBy: { startDate: "asc" },
      select: { startDate: true },
    }),
  ]);

  const countFor = (s: LeaveStatus) =>
    totals.find((t) => t.status === s)?._count._all ?? 0;

  // Desglose mensual: se materializan los 12 meses para que la gráfica no
  // tenga huecos, igual que en el reporte anual.
  const byMonth: LeaveMonthRow[] = MONTHS_ES.map((month) => ({
    month,
    pending: 0,
    approved: 0,
    rejected: 0,
  }));

  const perPsy = new Map<string, LeaveSummaryRow>();

  for (const row of inYear) {
    const bucket = byMonth[row.startDate.getMonth()];
    const psy =
      perPsy.get(row.psychologistId) ??
      {
        psychologistId: row.psychologistId,
        name: row.psychologist.user.name,
        pending: 0,
        approved: 0,
        rejected: 0,
        approvedHours: 0,
        approvedDays: 0,
      };

    if (row.status === LeaveStatus.PENDING) {
      bucket.pending += 1;
      psy.pending += 1;
    } else if (row.status === LeaveStatus.APPROVED) {
      bucket.approved += 1;
      psy.approved += 1;
      if (row.unit === LeaveUnit.HOURS) psy.approvedHours += row.quantity;
      else psy.approvedDays += row.quantity;
    } else {
      bucket.rejected += 1;
      psy.rejected += 1;
    }

    perPsy.set(row.psychologistId, psy);
  }

  const currentYear = new Date().getFullYear();
  const firstYear = earliest?.startDate.getFullYear() ?? currentYear;
  const availableYears = Array.from(
    { length: Math.max(1, currentYear - firstYear + 1) },
    (_, i) => currentYear - i,
  );

  return Response.json({
    year,
    availableYears,
    totals: {
      pending: countFor(LeaveStatus.PENDING),
      approved: countFor(LeaveStatus.APPROVED),
      rejected: countFor(LeaveStatus.REJECTED),
    },
    byMonth,
    byPsychologist: [...perPsy.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    ),
  });
}
