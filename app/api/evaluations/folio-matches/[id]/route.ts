import { type NextRequest } from "next/server";
import { EvaluationFolioMatchStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { evaluationFolioMatchDecisionSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/evaluations/folio-matches/[id] — decisión de Coordinación:
 * `LINK` liga el folio al paciente candidato (deja de aparecer en "Folios
 * sin expediente" y pasa a verse en su ficha); `NOT_MATCH` descarta la
 * sugerencia y el folio se queda sin ligar.
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

  const parsed = evaluationFolioMatchDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const match = await db.evaluationFolioMatch.findUnique({
    where: { id },
    include: { evaluationFolio: true },
  });
  if (!match) {
    return Response.json({ error: "No encontrado" }, { status: 404 });
  }
  if (match.status !== EvaluationFolioMatchStatus.PENDING) {
    return Response.json({ error: "Esta sugerencia ya fue revisada" }, { status: 409 });
  }

  if (parsed.data.decision === "NOT_MATCH") {
    const updated = await db.evaluationFolioMatch.update({
      where: { id },
      data: {
        status: EvaluationFolioMatchStatus.NOT_MATCH,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });
    return Response.json(updated);
  }

  // decision === "LINK"
  if (!match.candidatePatientId) {
    return Response.json(
      { error: "El expediente candidato ya no existe" },
      { status: 409 },
    );
  }
  if (match.evaluationFolio.patientId) {
    return Response.json(
      { error: "El folio ya quedó ligado a un expediente por otra vía" },
      { status: 409 },
    );
  }

  const result = await db.$transaction(async (tx) => {
    const folio = await tx.evaluationFolio.update({
      where: { id: match.evaluationFolioId },
      data: { patientId: match.candidatePatientId },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "EvaluationFolio",
        entityId: folio.id,
        action: AuditAction.UPDATE,
        changedFields: { patientId: match.candidatePatientId },
      },
      tx,
    );

    return tx.evaluationFolioMatch.update({
      where: { id },
      data: {
        status: EvaluationFolioMatchStatus.LINKED,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });
  });

  return Response.json(result);
}
