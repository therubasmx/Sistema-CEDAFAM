/**
 * Escanea todos los pacientes existentes buscando posibles duplicados por
 * teléfono + nombre similar (ver lib/patient-duplicates.ts) y los deja en la
 * cola de revisión (patient_duplicate_candidates) para que Coordinación
 * decida si se fusionan. No fusiona ni borra nada por sí solo.
 *
 * Uso:
 *   npm run find:duplicate-patients              # crea los candidatos
 *   npm run find:duplicate-patients -- --dry-run  # solo reporta, no inserta
 */
import { PrismaClient } from "@prisma/client";
import { findDuplicateCandidates } from "../lib/patient-duplicates";

const db = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

async function main() {
  const patients = await db.patient.findMany({
    select: { id: true, fullName: true, phoneNumber: true, fileNumber: true },
  });

  const pairs = findDuplicateCandidates(patients);
  console.log(`Pacientes evaluados:         ${patients.length}`);
  console.log(`Pares candidatos encontrados: ${pairs.length}`);

  if (pairs.length === 0) return;

  // Evita crear un candidato ya existente (pendiente o ya resuelto) para el
  // mismo par, sin importar el orden A/B.
  const existing = await db.patientDuplicateCandidate.findMany({
    select: { patientAId: true, patientBId: true },
  });
  const seen = new Set(
    existing
      .filter((c) => c.patientAId && c.patientBId)
      .map((c) => pairKey(c.patientAId as string, c.patientBId as string)),
  );

  const toCreate = pairs.filter((pair) => !seen.has(pairKey(pair.patientAId, pair.patientBId)));
  console.log(`Nuevos (no estaban ya en la cola): ${toCreate.length}`);

  if (toCreate.length === 0) return;

  const byId = new Map(patients.map((p) => [p.id, p]));

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No se insertó nada. Ejemplos:");
    toCreate.slice(0, 15).forEach((pair) => {
      const a = byId.get(pair.patientAId)!;
      const b = byId.get(pair.patientBId)!;
      console.log(`  - "${a.fullName}" (${a.phoneNumber}) <-> "${b.fullName}" (${b.phoneNumber})`);
    });
    return;
  }

  let created = 0;
  for (const pair of toCreate) {
    const a = byId.get(pair.patientAId)!;
    const b = byId.get(pair.patientBId)!;
    await db.patientDuplicateCandidate.create({
      data: {
        patientAId: a.id,
        patientBId: b.id,
        patientAName: a.fullName,
        patientBName: b.fullName,
        matchedByField: pair.matchedByField,
      },
    });
    created++;
  }

  console.log(`\n✅ ${created} candidatos agregados a la cola de revisión.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
