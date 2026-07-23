import { type NextRequest } from "next/server";
import { PatientDuplicateCandidateStatus, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { duplicateCandidateDecisionSchema } from "@/lib/validators";
import { patientDuplicateCompareInclude } from "@/lib/patient-status";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** GET /api/patients/duplicate-candidates/[id] — detalle para comparación lado a lado. */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;
  const { id } = await params;

  const candidate = await db.patientDuplicateCandidate.findUnique({
    where: { id },
    include: {
      patientA: { include: patientDuplicateCompareInclude },
      patientB: { include: patientDuplicateCompareInclude },
    },
  });

  if (!candidate) {
    return Response.json({ error: "No encontrado" }, { status: 404 });
  }

  return Response.json(candidate);
}

// Campos de identidad/contacto: si el expediente que se conserva no los
// tiene capturados, se completan con los del duplicado que se descarta, para
// no perder información aunque el que se conserva sea el más reciente.
const BACKFILL_FIELDS = [
  "curp",
  "dateOfBirth",
  "email",
  "address",
  "postalCode",
  "fileNumber",
  "cedafamFolio",
  "patientType",
] as const;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * PUT /api/patients/duplicate-candidates/[id] — decisión de Coordinación:
 * `NOT_DUPLICATE` reconoce que son personas distintas; `MERGE` fusiona los
 * dos expedientes en el indicado por `keepPatientId`: reasigna todo el
 * historial del otro (citas, estados, asignaciones, SIERE, folios, avances de
 * reporte semanal) al que se conserva, completa los campos vacíos con los del
 * que se descarta, y lo borra.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = duplicateCandidateDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const candidate = await db.patientDuplicateCandidate.findUnique({ where: { id } });
  if (!candidate) {
    return Response.json({ error: "No encontrado" }, { status: 404 });
  }
  if (candidate.status !== PatientDuplicateCandidateStatus.PENDING) {
    return Response.json({ error: "Este candidato ya fue revisado" }, { status: 409 });
  }
  if (!candidate.patientAId || !candidate.patientBId) {
    return Response.json(
      { error: "Uno de los dos expedientes ya no existe" },
      { status: 409 },
    );
  }

  if (parsed.data.decision === "NOT_DUPLICATE") {
    const updated = await db.patientDuplicateCandidate.update({
      where: { id },
      data: {
        status: PatientDuplicateCandidateStatus.NOT_DUPLICATE,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });
    return Response.json(updated);
  }

  // decision === "MERGE"
  const { keepPatientId } = parsed.data;
  if (keepPatientId !== candidate.patientAId && keepPatientId !== candidate.patientBId) {
    return Response.json(
      { error: "keepPatientId debe ser uno de los dos expedientes del candidato" },
      { status: 400 },
    );
  }
  const loserPatientId =
    keepPatientId === candidate.patientAId ? candidate.patientBId : candidate.patientAId;

  const [keeper, loser] = await Promise.all([
    db.patient.findUnique({
      where: { id: keepPatientId },
      include: { evaluationFolios: { where: { isHistorical: false } } },
    }),
    db.patient.findUnique({
      where: { id: loserPatientId },
      include: { evaluationFolios: { where: { isHistorical: false } } },
    }),
  ]);

  if (!keeper || !loser) {
    return Response.json(
      { error: "Uno de los dos expedientes ya no existe" },
      { status: 409 },
    );
  }

  // El índice único parcial de EvaluationFolio solo permite un folio vigente
  // (no histórico) por paciente: si ambos duplicados ya evaluaron por su
  // cuenta, no se puede fusionar sin decidir a mano cuál folio prevalece.
  if (keeper.evaluationFolios.length > 0 && loser.evaluationFolios.length > 0) {
    return Response.json(
      {
        error:
          "Ambos expedientes tienen un folio de evaluación vigente. Resuelve ese conflicto antes de fusionar.",
      },
      { status: 409 },
    );
  }

  const backfill: Record<string, unknown> = {};
  for (const field of BACKFILL_FIELDS) {
    const keeperValue = keeper[field];
    const loserValue = loser[field];
    if (isEmpty(keeperValue) && !isEmpty(loserValue)) {
      backfill[field] = loserValue;
    }
  }

  const result = await db.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: { patientId: loser.id },
      data: { patientId: keeper.id },
    });
    await tx.patientStatus.updateMany({
      where: { patientId: loser.id },
      data: { patientId: keeper.id },
    });
    await tx.patientAssignment.updateMany({
      where: { patientId: loser.id },
      data: { patientId: keeper.id },
    });
    await tx.siereApplication.updateMany({
      where: { patientId: loser.id },
      data: { patientId: keeper.id },
    });
    await tx.weeklyReportPatientUpdate.updateMany({
      where: { patientId: loser.id },
      data: { patientId: keeper.id },
    });
    await tx.patientIntakeMatch.updateMany({
      where: { matchedPatientId: loser.id },
      data: { matchedPatientId: keeper.id },
    });
    await tx.evaluationFolio.updateMany({
      where: { patientId: loser.id },
      data: { patientId: keeper.id },
    });

    const updatedKeeper =
      Object.keys(backfill).length > 0
        ? await tx.patient.update({
            where: { id: keeper.id },
            data: backfill as Prisma.PatientUpdateInput,
          })
        : keeper;

    await tx.patientDuplicateCandidate.update({
      where: { id },
      data: {
        status: PatientDuplicateCandidateStatus.MERGED,
        keptPatientId: keeper.id,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "Patient",
        entityId: keeper.id,
        action: AuditAction.UPDATE,
        changedFields: {
          mergedFromPatientId: loser.id,
          mergedFromPatientName: loser.fullName,
          backfilledFields: backfill,
        } as Prisma.InputJsonValue,
      },
      tx,
    );

    // Se borra al final: sus onDelete: SetNull dejan esta misma fila (ya
    // marcada MERGED arriba) y cualquier otro candidato pendiente que
    // también lo referenciara con ese lado en null, sin perder el registro.
    await tx.patient.delete({ where: { id: loser.id } });

    await recordAudit(
      {
        userId: user.id,
        entityType: "Patient",
        entityId: loser.id,
        action: AuditAction.DELETE,
        changedFields: {
          fullName: loser.fullName,
          mergedIntoPatientId: keeper.id,
        } as Prisma.InputJsonValue,
      },
      tx,
    );

    return updatedKeeper;
  });

  return Response.json(result);
}
