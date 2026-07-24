import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { findEvaluationFolioMatches } from "@/lib/evaluation-folio-matches";

/**
 * POST /api/evaluations/folio-matches/scan — busca, entre los folios de
 * evaluación sin paciente ligado, cuáles comparten número de expediente de
 * hospital con un paciente ya existente. Idempotente: no repite un folio que
 * ya esté en la cola (pendiente o ya resuelto).
 */
export async function POST() {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;

  const [orphanFolios, patients, queued] = await Promise.all([
    db.evaluationFolio.findMany({
      where: { patientId: null },
      select: { id: true, fileNumber: true },
    }),
    db.patient.findMany({
      select: { id: true, fullName: true, fileNumber: true },
    }),
    db.evaluationFolioMatch.findMany({ select: { evaluationFolioId: true } }),
  ]);

  const queuedIds = new Set(queued.map((q) => q.evaluationFolioId));
  const candidates = findEvaluationFolioMatches(orphanFolios, patients).filter(
    (c) => !queuedIds.has(c.evaluationFolioId),
  );

  if (candidates.length > 0) {
    await db.evaluationFolioMatch.createMany({
      data: candidates.map((c) => ({
        evaluationFolioId: c.evaluationFolioId,
        candidatePatientId: c.candidatePatientId,
        candidatePatientName: c.candidatePatientName,
        matchedByField: c.matchedByField,
      })),
    });
  }

  return Response.json({
    scanned: orphanFolios.length,
    found: candidates.length,
    created: candidates.length,
  });
}
