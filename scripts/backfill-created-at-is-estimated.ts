/**
 * Backfill puntual: marca createdAtIsEstimated = true en los pacientes
 * históricos (isHistorical = true) que ya están en la base y cuyo renglón en
 * "SOLICITUD DE CITA (respuestas).xlsx" no traía timestamp original — esos
 * quedaron con createdAt = fecha en que se corrió la importación, no una
 * fecha real de alta.
 *
 * scripts/migrate-patients.ts es idempotente (omite filas ya existentes), así
 * que no vuelve a tocar estos registros; este script corre una sola vez
 * después de aplicar add-created-at-is-estimated.sql en Neon.
 *
 * Uso:
 *   npx tsx scripts/backfill-created-at-is-estimated.ts              # aplica
 *   npx tsx scripts/backfill-created-at-is-estimated.ts -- --dry-run # solo reporta
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const FILE = "SOLICITUD DE CITA (respuestas).xlsx";
const DRY_RUN = process.argv.includes("--dry-run");

const COL = { timestamp: 1, name: 3, phone: 8 } as const;

function cellStr(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const anyVal = value as { text?: string; result?: unknown };
    if (anyVal.text) return String(anyVal.text);
    if (anyVal.result != null) return String(anyVal.result);
    return "";
  }
  return String(value).trim();
}

function parseDate(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date) return value;
  const s = cellStr(value);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2030) {
    return null;
  }
  return d;
}

function parsePhone(raw: string): string {
  const m = raw.match(/\d{7,}/);
  return m ? m[0] : raw.replace(/\D/g, "").slice(0, 15);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets[0];

  // Claves (nombre|teléfono) de renglones sin timestamp original — los mismos
  // que scripts/migrate-patients.ts habría marcado createdAtIsEstimated: true
  // si la columna ya hubiera existido al importarlos.
  const estimatedKeys = new Set<string>();
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const fullName = cellStr(row.getCell(COL.name).value);
    if (!fullName) continue;
    if (parseDate(row.getCell(COL.timestamp).value)) continue; // sí trae fecha real
    const phoneNumber = parsePhone(cellStr(row.getCell(COL.phone).value));
    estimatedKeys.add(`${fullName}|${phoneNumber}`);
  }

  const historicalPatients = await db.patient.findMany({
    where: { isHistorical: true },
    select: { id: true, fullName: true, phoneNumber: true, createdAtIsEstimated: true },
  });

  const toUpdate = historicalPatients.filter(
    (p) => estimatedKeys.has(`${p.fullName}|${p.phoneNumber}`) && !p.createdAtIsEstimated,
  );

  console.log(`Pacientes históricos en BD:        ${historicalPatients.length}`);
  console.log(`Renglones sin timestamp original:  ${estimatedKeys.size}`);
  console.log(`A marcar createdAtIsEstimated=true: ${toUpdate.length}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No se actualizó nada. Ejemplos:");
    toUpdate.slice(0, 5).forEach((p) => console.log(`  - ${p.fullName}`));
    return;
  }

  const res = await db.patient.updateMany({
    where: { id: { in: toUpdate.map((p) => p.id) } },
    data: { createdAtIsEstimated: true },
  });

  console.log(`\n✅ Backfill completo: ${res.count} pacientes actualizados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
