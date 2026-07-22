/**
 * Genera el SQL que importa los folios de evaluación del registro en papel
 * (Excel "Folios cedafam.xlsx", folios 100–205) a `evaluation_folios`.
 *
 *   npx tsx scripts/import-evaluation-folios.ts <ruta-del-excel> [salida.sql]
 *
 * No toca la base: lee el Excel, resuelve contra la base a qué Patient y a qué
 * User corresponde cada fila, y escribe un .sql que el usuario corre a mano en
 * Neon (ver add-evaluaciones.sql). Imprime además un reporte de lo que NO pudo
 * ligar, que es lo que habrá que completar después desde el módulo.
 *
 * Criterios, deliberadamente conservadores — es preferible dejar un folio sin
 * ligar que colgarlo del paciente equivocado:
 *
 *   - Paciente: primero por número de expediente exacto; si no, por nombre
 *     normalizado y SOLO si ese nombre identifica a un único paciente.
 *   - Evaluador: por el mapa explícito de abajo. El Excel escribe a la misma
 *     persona de hasta tres formas ("Lic.Jorge luis Vivas Ramírez"), así que
 *     se resuelve a mano en vez de adivinar por parecido.
 *   - Fecha: se guarda literal en `evaluationDateText`. Los formatos del Excel
 *     son irreconciliables entre sí (rangos, días sueltos, sin año), y
 *     convertirlos sería inventar datos clínicos.
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();

/**
 * Cómo se llama en el Excel cada evaluador que SÍ es usuario del sistema.
 * La llave es el nombre normalizado (ver `norm`); el valor, el nombre exacto
 * del usuario. Quien no esté aquí se queda sin ligar, conservando su nombre.
 */
const EVALUATOR_MAP: Record<string, string> = {
  "pamela cervera": "Pamela Cervera",
  "jorge luis vivas ramirez": "Jorge Vivas",
  "aleska pamela andujar sanchez": "Aleska Andujar",
  "erik yudiel martinez lopez": "Erik Martinez",
  "isaura lizbeth lopez perez": "Isaura López",
};

/** Minúsculas, sin acentos ni puntuación, espacios colapsados. */
function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quita el título del evaluador ("Lic.", "Mtra.") para poder mapearlo. */
function stripTitle(name: string): string {
  return name.replace(/^\s*(lic|mtra|mtro|dra|dr|psic)[.,]?\s*/i, "").trim();
}

/** Endereza el título y los espacios, sin tocar el nombre en sí. */
function tidyName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/^(Lic|Mtra|Mtro|Dra|Dr|Psic)[.,]?\s*/i, (_m, t: string) => `${t}. `)
    .trim();
}

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** La fecha del registro, tal como quedará guardada. */
function dateText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
  }
  const text = String(value).replace(/\s+/g, " ").replace(/^[:\s-]+/, "").trim();
  return text || null;
}

/** Literal SQL de un texto, o NULL. */
function sql(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

interface Row {
  folio: number;
  patientName: string | null;
  fileNumber: string | null;
  evaluatorName: string | null;
  dateText: string | null;
  link: string | null;
}

function readRows(path: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  return wb.xlsx.readFile(path).then(() => {
    const ws = wb.worksheets[0];
    const rows: Row[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return; // encabezado
      const folio = Number(row.getCell(1).value);
      if (!Number.isFinite(folio)) return;

      const text = (i: number): string | null => {
        const v = row.getCell(i).value;
        if (v === null || v === undefined) return null;
        const s = typeof v === "object" && "text" in v ? String(v.text) : String(v);
        return s.trim() || null;
      };

      const linkCell = row.getCell(6).value as
        | { hyperlink?: string; text?: string }
        | string
        | null;
      let link: string | null = null;
      if (linkCell && typeof linkCell === "object") {
        link = linkCell.hyperlink ?? linkCell.text ?? null;
      } else if (linkCell) {
        link = String(linkCell);
      }
      if (link && !/^https?:\/\//i.test(link)) link = null;

      rows.push({
        folio,
        patientName: text(2),
        fileNumber: text(3),
        evaluatorName: text(4),
        dateText: dateText(row.getCell(5).value),
        link: link?.trim() || null,
      });
    });
    return rows;
  });
}

async function main() {
  const excelPath = process.argv[2];
  const outPath = process.argv[3] ?? "import-folios-historicos.sql";
  if (!excelPath) {
    console.error("Uso: npx tsx scripts/import-evaluation-folios.ts <excel> [salida.sql]");
    process.exit(1);
  }

  const rows = await readRows(excelPath);
  console.log(`Filas con folio en el Excel: ${rows.length}`);

  const patients = await db.patient.findMany({
    select: { id: true, fullName: true, fileNumber: true },
  });
  const users = await db.user.findMany({ select: { id: true, name: true } });

  // Índice por expediente y por nombre. Los nombres que identifican a más de
  // un paciente se marcan como ambiguos y no se usan para ligar.
  const byFile = new Map<string, string>();
  const nameHits = new Map<string, string[]>();
  for (const p of patients) {
    if (p.fileNumber?.trim()) {
      const k = p.fileNumber.trim();
      // Un expediente repetido tampoco sirve para decidir.
      byFile.set(k, byFile.has(k) ? "" : p.id);
    }
    const nk = norm(p.fullName);
    nameHits.set(nk, [...(nameHits.get(nk) ?? []), p.id]);
  }
  const userByName = new Map(users.map((u) => [u.name, u.id]));

  const unlinkedPatients: string[] = [];
  const unlinkedEvaluators = new Map<string, number>();
  const noDate: number[] = [];
  const values: string[] = [];
  let linkedPatient = 0;
  let linkedEvaluator = 0;

  for (const r of rows) {
    // — Paciente —
    let patientId: string | null = null;
    const file = r.fileNumber?.trim();
    if (file && byFile.get(file)) {
      patientId = byFile.get(file)!;
    } else if (r.patientName) {
      const hits = nameHits.get(norm(r.patientName)) ?? [];
      if (hits.length === 1) patientId = hits[0];
    }
    if (patientId) linkedPatient++;
    else unlinkedPatients.push(`  folio ${r.folio} — ${r.patientName ?? "(sin nombre)"}`);

    // — Evaluador —
    let evaluatorId: string | null = null;
    if (r.evaluatorName) {
      const userName = EVALUATOR_MAP[norm(stripTitle(r.evaluatorName))];
      if (userName) evaluatorId = userByName.get(userName) ?? null;
    }
    if (evaluatorId) linkedEvaluator++;
    else if (r.evaluatorName) {
      const k = tidyName(r.evaluatorName);
      unlinkedEvaluators.set(k, (unlinkedEvaluators.get(k) ?? 0) + 1);
    }

    if (!r.dateText) noDate.push(r.folio);

    values.push(
      `  (${sql(randomUUID())}, ${r.folio}, TRUE, ` +
        `${sql(r.patientName ?? "Sin nombre")}, ${sql(r.fileNumber)}, ` +
        `${sql(r.evaluatorName ? tidyName(r.evaluatorName) : "Sin evaluador")}, ` +
        `${sql(patientId)}, ${sql(evaluatorId)}, ` +
        `${sql(r.dateText)}, ${sql(r.link)})`,
    );
  }

  const out = `-- Folios históricos de evaluación (registro en papel del centro).
-- Generado por scripts/import-evaluation-folios.ts — no editar a mano.
--
-- ${rows.length} folios. Requiere add-evaluaciones.sql y
-- add-evaluaciones-historicos.sql aplicados antes.
--
-- Es idempotente: si ya se importó, ON CONFLICT deja las filas como están, así
-- que volver a correrlo no pisa lo que la Contadora haya completado a mano.

INSERT INTO "evaluation_folios" (
  "id", "folio", "isHistorical",
  "patientName", "fileNumber", "evaluatorName",
  "patientId", "evaluatorId",
  "evaluationDateText", "reportLink",
  "createdAt", "updatedAt"
)
SELECT v."id", v."folio", v."isHistorical",
       v."patientName", v."fileNumber", v."evaluatorName",
       v."patientId", v."evaluatorId",
       v."evaluationDateText", v."reportLink",
       NOW(), NOW()
FROM (VALUES
${values.join(",\n")}
) AS v("id", "folio", "isHistorical",
       "patientName", "fileNumber", "evaluatorName",
       "patientId", "evaluatorId",
       "evaluationDateText", "reportLink")
ON CONFLICT ("folio") DO NOTHING;
`;

  writeFileSync(outPath, out);

  console.log(`\nSQL escrito en ${outPath}`);
  console.log(`\nPaciente ligado ....... ${linkedPatient}/${rows.length}`);
  console.log(`Evaluador ligado ...... ${linkedEvaluator}/${rows.length}`);
  console.log(`Sin fecha ............. ${noDate.length}${noDate.length ? ` (folios ${noDate.join(", ")})` : ""}`);
  console.log(`\nPacientes que no están en el sistema (${unlinkedPatients.length}):`);
  console.log(unlinkedPatients.join("\n") || "  ninguno");
  console.log(`\nEvaluadores que no son usuarios del sistema:`);
  for (const [name, count] of [...unlinkedEvaluators].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(2)} folios — ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
