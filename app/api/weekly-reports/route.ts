import { type NextRequest } from "next/server";
import { Prisma, Role, ServiceType, TherapyStatus, EvaluationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { weeklyReportSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { pendingWeekFor } from "@/lib/weekly-report";

/**
 * GET /api/weekly-reports — list reports.
 * Psychologists see their own; admin/coordinator/accountant see all.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const where: Prisma.WeeklyReportWhereInput = {};
  if (user.role === Role.PSYCHOLOGIST) {
    if (!user.psychologistId) return Response.json([]);
    where.psychologistId = user.psychologistId;
  }

  const reports = await db.weeklyReport.findMany({
    where,
    orderBy: { weekStartDate: "desc" },
    take: 100,
    include: {
      psychologist: { include: { user: { select: { name: true } } } },
      _count: { select: { patientUpdates: true } },
    },
  });

  return Response.json(reports);
}

/**
 * POST /api/weekly-reports — submit the mandatory weekly report.
 * The reported week is resolved server-side (the pending/overdue week), so the
 * client can't backfill arbitrary weeks. Runs in a single transaction:
 * creates the report, per-patient updates, appends patient status history, and
 * replaces the psychologist's availability.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("weeklyReports:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  if (!user.psychologistId) {
    return Response.json(
      { error: "Solo psicólogos pueden enviar reportes" },
      { status: 403 },
    );
  }

  const resolved = await pendingWeekFor(user.psychologistId);
  if (!resolved) {
    return Response.json(
      { error: "No tienes un reporte pendiente esta semana" },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = weeklyReportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const psychologistId = user.psychologistId;
  const weekStartDate = resolved.weekStartDate;

  // Guard against patientUpdates referencing patients not assigned to me.
  if (data.patientUpdates.length > 0) {
    const ids = data.patientUpdates.map((u) => u.patientId);
    const mineCount = await db.patientAssignment.count({
      where: { psychologistId, isActive: true, patientId: { in: ids } },
    });
    if (mineCount !== new Set(ids).size) {
      return Response.json(
        { error: "Incluiste pacientes que no tienes asignados" },
        { status: 403 },
      );
    }
  }

  try {
    const report = await db.$transaction(async (tx) => {
      const created = await tx.weeklyReport.create({
        data: {
          psychologistId,
          weekStartDate,
          hoursOfAttention: data.hoursOfAttention,
          activePatientCount: data.activePatientCount,
          notes: data.notes || null,
        },
      });

      // Per-patient updates inside the report + append to status history.
      for (const u of data.patientUpdates) {
        const therapyStatus =
          u.serviceType === ServiceType.EVALUATION ? null : u.therapyStatus ?? null;
        const evaluationStatus =
          u.serviceType === ServiceType.EVALUATION
            ? u.evaluationStatus ?? null
            : null;
        const hasStatus = !!therapyStatus || !!evaluationStatus;

        await tx.weeklyReportPatientUpdate.create({
          data: {
            weeklyReportId: created.id,
            patientId: u.patientId,
            serviceType: u.serviceType,
            therapyStatus,
            evaluationStatus,
            patientType: u.patientType ?? null,
          },
        });

        // El tipo de px se actualiza en el paciente para los reportes.
        if (u.patientType) {
          await tx.patient.update({
            where: { id: u.patientId },
            data: { patientType: u.patientType },
          });
        }

        // Solo registramos historial de estado si hubo un cambio real respecto
        // al último estado guardado (evita duplicar entradas cuando el
        // psicólogo deja tal cual una fila precargada de la semana anterior).
        if (hasStatus) {
          const lastStatus = await tx.patientStatus.findFirst({
            where: { patientId: u.patientId },
            orderBy: { changedAt: "desc" },
            select: { serviceType: true, therapyStatus: true, evaluationStatus: true },
          });
          const changed =
            !lastStatus ||
            lastStatus.serviceType !== u.serviceType ||
            lastStatus.therapyStatus !== therapyStatus ||
            lastStatus.evaluationStatus !== evaluationStatus;

          if (changed) {
            await tx.patientStatus.create({
              data: {
                patientId: u.patientId,
                serviceType: u.serviceType,
                therapyStatus,
                evaluationStatus,
                changedById: user.id,
                notes: "Actualizado en reporte semanal",
              },
            });
          }
        }

        // Estados de salida (cualquier terapia no-activa, o evaluación cancelada)
        // liberan el cupo del psicólogo en "Capacidad de psicólogos".
        const freesCapacity =
          (!!therapyStatus && therapyStatus !== TherapyStatus.ACTIVE) ||
          evaluationStatus === EvaluationStatus.CANCELLED;

        if (freesCapacity) {
          await tx.patientAssignment.updateMany({
            where: { patientId: u.patientId, psychologistId, isActive: true },
            data: { isActive: false },
          });
        }
      }

      // Replace availability with the schedule declared in the report.
      if (data.availability.length > 0) {
        await tx.psychologistAvailability.deleteMany({ where: { psychologistId } });
        await tx.psychologistAvailability.createMany({
          data: data.availability.map((a) => ({
            psychologistId,
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        });
      }

      await recordAudit(
        {
          userId: user.id,
          entityType: "WeeklyReport",
          entityId: created.id,
          action: AuditAction.CREATE,
          changedFields: {
            weekStartDate: weekStartDate.toISOString(),
            hoursOfAttention: data.hoursOfAttention,
            patientUpdates: data.patientUpdates.length,
          },
        },
        tx,
      );

      return created;
    });

    return Response.json(report, { status: 201 });
  } catch (e) {
    // Unique violation = a report for this week already exists (race).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json(
        { error: "Ya enviaste el reporte de esta semana" },
        { status: 409 },
      );
    }
    throw e;
  }
}
