import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { findDuplicateCandidates } from "@/lib/patient-duplicates";

/**
 * POST /api/patients/duplicate-candidates/scan — corre el mismo escaneo que
 * scripts/find-duplicate-patients.ts, pero desde el servidor (Vercel), para
 * no depender de que quien lo dispare tenga una conexión directa estable a
 * Postgres por el puerto 5432 (esta app y el editor SQL de Neon sí la
 * tienen). Idempotente: no repite un par que ya esté en la cola.
 */
export async function POST() {
  const guard = await requirePermission("patients:reviewMatch");
  if (guard instanceof Response) return guard;

  const patients = await db.patient.findMany({
    select: { id: true, fullName: true, phoneNumber: true },
  });

  const pairs = findDuplicateCandidates(patients);
  if (pairs.length === 0) {
    return Response.json({ scanned: patients.length, found: 0, created: 0 });
  }

  const existing = await db.patientDuplicateCandidate.findMany({
    select: { patientAId: true, patientBId: true },
  });
  const seen = new Set(
    existing
      .filter((c) => c.patientAId && c.patientBId)
      .map((c) => [c.patientAId, c.patientBId].sort().join("|")),
  );

  const byId = new Map(patients.map((p) => [p.id, p]));
  const toCreate = pairs.filter(
    (pair) => !seen.has([pair.patientAId, pair.patientBId].sort().join("|")),
  );

  if (toCreate.length > 0) {
    await db.patientDuplicateCandidate.createMany({
      data: toCreate.map((pair) => ({
        patientAId: pair.patientAId,
        patientBId: pair.patientBId,
        patientAName: byId.get(pair.patientAId)!.fullName,
        patientBName: byId.get(pair.patientBId)!.fullName,
        matchedByField: pair.matchedByField,
      })),
    });
  }

  return Response.json({
    scanned: patients.length,
    found: pairs.length,
    created: toCreate.length,
  });
}
