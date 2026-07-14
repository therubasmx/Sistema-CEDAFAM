/**
 * ETL: migra los pacientes históricos del Google Sheets exportado
 * ("SOLICITUD DE CITA (respuestas).xlsx") a PostgreSQL.
 *
 * - Normaliza área de servicio, horario y tipo de referencia (los datos
 *   originales tienen mucha variación de escritura).
 * - Es idempotente: omite registros ya presentes (clave nombre + teléfono) y
 *   duplicados dentro del propio archivo.
 *
 * Uso:
 *   npm run migrate:patients              # inserta
 *   npm run migrate:patients -- --dry-run # solo reporta, no inserta
 */
import ExcelJS from "exceljs";
import {
  PrismaClient,
  ServiceArea,
  TimeSlot,
  ReferenceType,
  type Prisma,
} from "@prisma/client";

const db = new PrismaClient();
const FILE = "SOLICITUD DE CITA (respuestas).xlsx";
const DRY_RUN = process.argv.includes("--dry-run");

// Column indices (1-based) in the source sheet.
const COL = {
  timestamp: 1,
  area: 2,
  name: 3,
  age: 4,
  dob: 5,
  reason: 6,
  schedule: 7,
  phone: 8,
  convenio: 10,
  email: 11,
  address: 12,
  email2: 13,
  curp: 18,
  postalCode: 19,
} as const;

function cellStr(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // Hyperlink / rich text / formula result.
    const anyVal = value as { text?: string; result?: unknown };
    if (anyVal.text) return String(anyVal.text);
    if (anyVal.result != null) return String(anyVal.result);
    return "";
  }
  return String(value).trim();
}

function normalizeArea(raw: string): ServiceArea {
  const s = raw.toLowerCase();
  if (s.includes("evalua")) return ServiceArea.PSYCHOLOGICAL_EVALUATION;
  if (s.includes("psiquiat")) return ServiceArea.PSYCHIATRY;
  return ServiceArea.PSYCHOLOGY; // psicología, consulta, vacío → default
}

function normalizeSchedule(raw: string): TimeSlot {
  return raw.toLowerCase().includes("matut") ? TimeSlot.MORNING : TimeSlot.AFTERNOON;
}

function normalizeReference(raw: string): ReferenceType {
  const s = raw.toLowerCase();
  if (s.includes("coae")) return ReferenceType.COAE;
  if (s.includes("dups")) return ReferenceType.DUPS;
  if (s.includes("alumno") || s.includes("estudiante")) return ReferenceType.UM_STUDENT;
  if (s.includes("empleado") && s.includes("h")) return ReferenceType.HOSPITAL_EMPLOYEE;
  if (s.includes("empleado")) return ReferenceType.UM_EMPLOYEE;
  return ReferenceType.NONE;
}

function parseAge(raw: ExcelJS.CellValue): number {
  const n = typeof raw === "number" ? raw : parseInt(cellStr(raw), 10);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? Math.trunc(n) : 0;
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

function parseCurp(raw: string): string | null {
  const c = raw.toUpperCase().replace(/\s/g, "");
  return /^[A-Z0-9]{18}$/.test(c) ? c : null;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.worksheets[0];

  // Existing keys to skip (idempotency).
  const existing = await db.patient.findMany({
    select: { fullName: true, phoneNumber: true },
  });
  const seen = new Set(existing.map((p) => `${p.fullName}|${p.phoneNumber}`));

  const toInsert: Prisma.PatientCreateManyInput[] = [];
  let skippedNoName = 0;
  let skippedDup = 0;

  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const fullName = cellStr(row.getCell(COL.name).value);
    if (!fullName) {
      skippedNoName++;
      continue;
    }

    const phoneNumber = parsePhone(cellStr(row.getCell(COL.phone).value));
    const key = `${fullName}|${phoneNumber}`;
    if (seen.has(key)) {
      skippedDup++;
      continue;
    }
    seen.add(key);

    const email =
      cellStr(row.getCell(COL.email).value) ||
      cellStr(row.getCell(COL.email2).value) ||
      null;

    toInsert.push({
      fullName,
      age: parseAge(row.getCell(COL.age).value),
      dateOfBirth: parseDate(row.getCell(COL.dob).value),
      curp: parseCurp(cellStr(row.getCell(COL.curp).value)),
      phoneNumber,
      address: cellStr(row.getCell(COL.address).value) || null,
      postalCode: cellStr(row.getCell(COL.postalCode).value) || null,
      email: email && email.includes("@") ? email : null,
      serviceArea: normalizeArea(cellStr(row.getCell(COL.area).value)),
      referenceType: normalizeReference(cellStr(row.getCell(COL.convenio).value)),
      consultationReason:
        cellStr(row.getCell(COL.reason).value) || "Sin especificar",
      preferredTimeSlot: normalizeSchedule(cellStr(row.getCell(COL.schedule).value)),
      createdAt: parseDate(row.getCell(COL.timestamp).value) ?? undefined,
      isHistorical: true,
    });
  }

  console.log(`Filas en archivo:      ${ws.rowCount - 1}`);
  console.log(`Sin nombre (omitidos): ${skippedNoName}`);
  console.log(`Duplicados (omitidos): ${skippedDup}`);
  console.log(`A insertar:            ${toInsert.length}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No se insertó nada. Ejemplos:");
    toInsert.slice(0, 3).forEach((p) =>
      console.log(`  - ${p.fullName} | ${p.serviceArea} | ${p.preferredTimeSlot}`),
    );
    return;
  }

  // Insert in batches.
  let inserted = 0;
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const res = await db.patient.createMany({ data: batch });
    inserted += res.count;
    console.log(`  insertados ${inserted}/${toInsert.length}…`);
  }

  console.log(`\n✅ Migración completa: ${inserted} pacientes insertados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
