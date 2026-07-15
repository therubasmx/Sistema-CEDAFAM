/**
 * Agrega expediente hospital + folio CEDAFAM a los pacientes existentes,
 * a partir del Excel de expedientes compartido por CEDAFAM.
 *
 * Empareja por nombre completo normalizado (sin acentos, mayúsculas ni
 * espacios extra). Solo actualiza pacientes que YA existen en el sistema;
 * los nombres del Excel sin coincidencia en la BD se omiten. No sobrescribe
 * un expediente/folio que el paciente ya tuviera capturado.
 *
 * Uso:
 *   npm run update:expedientes             # solo reporta, no escribe (dry-run)
 *   npm run update:expedientes -- --apply  # aplica los cambios
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const FILE = "Expedientes cedafam Excel.xlsx";
const APPLY = process.argv.includes("--apply");

// Datos empiezan en la fila 6: col A = expediente hospital, B = folio CEDAFAM, C = nombre.
const FIRST_DATA_ROW = 6;
const COL = { fileNumber: 1, cedafamFolio: 2, name: 3 } as const;

function cellStr(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (typeof value === "object") {
    const anyVal = value as { text?: string; result?: unknown };
    if (anyVal.text) return String(anyVal.text).trim() || null;
    if (anyVal.result != null) return String(anyVal.result).trim() || null;
    return null;
  }
  const s = String(value).trim();
  return s || null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets[0];

  // Excel: nombre normalizado -> { fileNumber, cedafamFolio }
  const excelByName = new Map<string, { fileNumber: string | null; cedafamFolio: string | null }>();
  for (let i = FIRST_DATA_ROW; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const name = cellStr(row.getCell(COL.name).value);
    if (!name) continue;
    excelByName.set(normalizeName(name), {
      fileNumber: cellStr(row.getCell(COL.fileNumber).value),
      cedafamFolio: cellStr(row.getCell(COL.cedafamFolio).value),
    });
  }
  console.log(`Registros en Excel:            ${excelByName.size}`);

  const patients = await db.patient.findMany({
    select: { id: true, fullName: true, fileNumber: true, cedafamFolio: true },
  });
  console.log(`Pacientes en el sistema:        ${patients.length}`);

  const toUpdate: { id: string; fullName: string; fileNumber: string | null; cedafamFolio: string | null }[] = [];
  let sinCoincidencia = 0;
  let yaCompletos = 0;

  for (const p of patients) {
    const match = excelByName.get(normalizeName(p.fullName));
    if (!match) {
      sinCoincidencia++;
      continue;
    }

    // No pisar datos ya capturados a mano; solo llenar lo que falte.
    const nextFileNumber = p.fileNumber ?? match.fileNumber ?? null;
    const nextCedafamFolio = p.cedafamFolio ?? match.cedafamFolio ?? null;

    const changes =
      nextFileNumber !== p.fileNumber || nextCedafamFolio !== p.cedafamFolio;

    if (!changes) {
      yaCompletos++;
      continue;
    }

    toUpdate.push({
      id: p.id,
      fullName: p.fullName,
      fileNumber: nextFileNumber,
      cedafamFolio: nextCedafamFolio,
    });
  }

  console.log(`Sin coincidencia en Excel:      ${sinCoincidencia}`);
  console.log(`Ya tenían ambos datos:          ${yaCompletos}`);
  console.log(`A actualizar:                   ${toUpdate.length}`);

  console.log("\nEjemplos (primeros 15):");
  toUpdate.slice(0, 15).forEach((p) =>
    console.log(
      `  - ${p.fullName} | Expediente hospital: ${p.fileNumber ?? "—"} | Folio CEDAFAM: ${p.cedafamFolio ?? "—"}`,
    ),
  );

  if (!APPLY) {
    console.log("\n[DRY RUN] No se escribió nada. Ejecuta con -- --apply para aplicar.");
    return;
  }

  let updated = 0;
  for (const p of toUpdate) {
    await db.patient.update({
      where: { id: p.id },
      data: { fileNumber: p.fileNumber, cedafamFolio: p.cedafamFolio },
    });
    updated++;
    if (updated % 50 === 0) console.log(`  actualizados ${updated}/${toUpdate.length}…`);
  }

  console.log(`\n✅ Actualización completa: ${updated} pacientes actualizados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
