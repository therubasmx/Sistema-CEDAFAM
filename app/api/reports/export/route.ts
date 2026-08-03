import { type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth";
import {
  buildReport,
  buildPsychologistReport,
  type ReportData,
  type PsychologistReportRow,
} from "@/lib/reports";
import { parseDateRange } from "@/lib/report-range";
import {
  parseSections,
  hasPatientSection,
  hasPsychSection,
  type ReportSection,
} from "@/lib/report-sections";
import { serviceAreaLabels } from "@/lib/labels";

export const runtime = "nodejs";

/** Chart images (data URLs) captured client-side from the reports screen, keyed by chart id. */
type ChartImages = Record<string, string>;

/**
 * POST /api/reports/export
 * Body: { start, end, format: "pdf" | "xlsx", sections: string[], images?: ChartImages }
 * `sections` picks which report blocks to include (see lib/report-sections.ts);
 * missing/empty → all. `images` are PNG data URLs of the donut charts shown on
 * screen, keyed by chart id (see CHART_SECTIONS in export-dialog.tsx) — when
 * present they're embedded above their matching table.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("reports:read");
  if (guard instanceof Response) return guard;

  const body = (await req.json().catch(() => null)) as {
    start?: string;
    end?: string;
    format?: string;
    sections?: string[];
    images?: ChartImages;
  } | null;
  if (!body) {
    return Response.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  const range = parseDateRange(body.start ?? null, body.end ?? null);
  if (!range) {
    return Response.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  const format = body.format === "pdf" ? "pdf" : "xlsx";
  const sections = parseSections(body.sections?.join(",") ?? null);
  const images = body.images ?? {};

  const endExclusive = addDays(range.end, 1);
  const [report, psychRows] = await Promise.all([
    hasPatientSection(sections) ? buildReport(range.start, endExclusive) : null,
    hasPsychSection(sections)
      ? buildPsychologistReport(range.start, endExclusive)
      : null,
  ]);

  const rangeLabel = {
    start: formatISODate(range.start),
    end: formatISODate(range.end),
  };
  const filenameRange = `${rangeLabel.start}_a_${rangeLabel.end}`;

  if (format === "pdf") {
    const bytes = buildPdf(rangeLabel, sections, report, psychRows, images);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-cedafam-${filenameRange}.pdf"`,
      },
    });
  }

  const buffer = await buildXlsx(rangeLabel, sections, report, psychRows, images);
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reporte-cedafam-${filenameRange}.xlsx"`,
    },
  });
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface RangeLabel {
  start: string;
  end: string;
}

/** One-line description shown above each exported table, in both PDF and XLSX. */
const TABLE_NOTES = {
  patientsNew:
    "Pacientes nuevos registrados en el rango, agrupados por semana y área de atención.",
  therapyStatus: "Pacientes de psicología según su estado actual de terapia.",
  psychiatryStatus: "Pacientes de psiquiatría según su estado actual.",
  psychEvalStatus: "Pacientes en evaluación psicológica según su estado.",
  neuroEvalStatus: "Pacientes en evaluación neuropsicológica según su estado.",
  patientType: "Pacientes activos agrupados por tipo de paciente.",
  siere: "Pacientes activos agrupados por nivel de riesgo SIERE.",
  reasons: "Motivos de consulta más frecuentes entre los pacientes del rango.",
  indicators:
    "Duración promedio de terapia y evaluación, y tasa de deserción en el rango.",
  psychSummary:
    "Psicólogos activos con su especialidad, modalidad y número de pacientes asignados.",
  psychDetail: "Detalle de los pacientes activos asignados a cada psicólogo.",
  sessions: "Citas agendadas por psicólogo en el rango y su resultado.",
  hours:
    "Horas de atención por psicólogo en el rango, desglosadas por tipo de servicio.",
} as const;

/** Builds an autoTable `head` with a one-line italic description row above the column labels. */
function tableHead(description: string, columns: readonly string[]): RowInput[] {
  const note: CellDef = {
    content: description,
    colSpan: columns.length,
    styles: { fontStyle: "italic", fontSize: 8, textColor: 100, fillColor: 255 },
  };
  return [[note], [...columns]];
}

const PDF_MARGIN = 14;
const PDF_CHART_SIZE = 42; // mm, square donut image

function buildPdf(
  range: RangeLabel,
  sections: Set<ReportSection>,
  r: ReportData | null,
  psych: PsychologistReportRow[] | null,
  images: Record<string, string>,
): ArrayBuffer {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(16);
  doc.text(`CEDAFAM — Reporte (${range.start} a ${range.end})`, PDF_MARGIN, 18);
  let y = 28;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PDF_MARGIN) {
      doc.addPage();
      y = 20;
    }
  };

  const finalY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  /** Bold section heading, e.g. matching the card title shown on screen. */
  const addHeading = (text: string) => {
    ensureSpace(10);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(text, PDF_MARGIN, y);
    doc.setFont("helvetica", "normal");
    y += 6;
  };

  /** Places the donut chart PNG captured from the reports screen, if provided. */
  const addChartImage = (key: string) => {
    const img = images[key];
    if (!img) return;
    ensureSpace(PDF_CHART_SIZE + 4);
    doc.addImage(img, "PNG", PDF_MARGIN, y, PDF_CHART_SIZE, PDF_CHART_SIZE);
    y += PDF_CHART_SIZE + 4;
  };

  const addTable = (head: RowInput[], body: RowInput[]) => {
    ensureSpace(20);
    autoTable(doc, { startY: y, head, body, margin: { left: PDF_MARGIN, right: PDF_MARGIN } });
    y = finalY() + 10;
  };

  if (r && sections.has("patients_new")) {
    ensureSpace(8);
    doc.setFontSize(10);
    doc.text(`Pacientes nuevos en el rango: ${r.totals.newPatients}`, PDF_MARGIN, y);
    y += 6;
    addTable(
      tableHead(TABLE_NOTES.patientsNew, [
        "Período",
        "Psicología",
        "Psiquiatría",
        "Evaluación",
        "Neuropsicológica",
        "Total",
      ]),
      r.newPatientsByPeriod.map((p) => [
        p.period,
        p.PSYCHOLOGY,
        p.PSYCHIATRY,
        p.PSYCHOLOGICAL_EVALUATION,
        p.NEUROPSYCHOLOGICAL,
        p.total,
      ]),
    );
  }

  if (r && sections.has("patients_status")) {
    const groups = [
      {
        key: "therapyStatus",
        heading: "Pacientes por estado (terapia)",
        note: TABLE_NOTES.therapyStatus,
        column: "Estado de terapia",
        rows: r.patientsByTherapyStatus,
      },
      {
        key: "psychiatryStatus",
        heading: "Pacientes por estado (psiquiatría)",
        note: TABLE_NOTES.psychiatryStatus,
        column: "Estado de psiquiatría",
        rows: r.patientsByPsychiatryStatus,
      },
      {
        key: "psychEvalStatus",
        heading: "Pacientes por estado (Evaluación psicológica)",
        note: TABLE_NOTES.psychEvalStatus,
        column: "Estado de evaluación psicológica",
        rows: r.patientsByPsychEvaluationStatus,
      },
      {
        key: "neuroEvalStatus",
        heading: "Pacientes por estado (Evaluación Neuropsicológica)",
        note: TABLE_NOTES.neuroEvalStatus,
        column: "Estado de evaluación neuropsicológica",
        rows: r.patientsByNeuroEvaluationStatus,
      },
    ];
    for (const g of groups) {
      addHeading(g.heading);
      addChartImage(g.key);
      addTable(
        tableHead(g.note, [g.column, "Pacientes"]),
        g.rows.map((s) => [s.label, s.count]),
      );
    }
  }

  if (r && sections.has("patients_type")) {
    addHeading("Pacientes por tipo");
    addChartImage("patientType");
    addTable(
      tableHead(TABLE_NOTES.patientType, ["Tipo de paciente", "Pacientes"]),
      r.patientsByType.map((s) => [s.label, s.count]),
    );
  }

  if (r && sections.has("patients_siere")) {
    addHeading("Pacientes SIERE por nivel");
    addChartImage("siereLevel");
    addTable(
      tableHead(TABLE_NOTES.siere, ["Nivel SIERE", "Pacientes"]),
      r.patientsBySiereLevel.map((s) => [s.label, s.count]),
    );
  }

  if (r && sections.has("patients_reasons")) {
    addTable(
      tableHead(TABLE_NOTES.reasons, ["Motivo de consulta frecuente", "Veces"]),
      r.topReasons.map((s) => [s.label, s.count]),
    );
  }

  if (r && sections.has("patients_indicators")) {
    addTable(tableHead(TABLE_NOTES.indicators, ["Indicador", "Valor"]), [
      ["Duración promedio terapia (meses)", r.averageDuration.therapyMonths],
      ["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks],
      ["Tasa de deserción (nunca vino + alta voluntaria)", `${r.dropout.rate}%`],
    ]);
  }

  if (psych && sections.has("psych_patients")) {
    addTable(
      tableHead(TABLE_NOTES.psychSummary, [
        "Psicólogo",
        "Especialidad",
        "Modalidad",
        "Pacientes activos",
      ]),
      psych.map((p) => [p.name, p.speciality, p.workType, p.activePatients.length]),
    );
    addTable(
      tableHead(TABLE_NOTES.psychDetail, ["Psicólogo", "Paciente asignado"]),
      psych.flatMap((p) =>
        p.activePatients.length === 0
          ? [[p.name, "—"]]
          : p.activePatients.map((name) => [p.name, name]),
      ),
    );
  }

  if (psych && sections.has("psych_sessions")) {
    addTable(
      tableHead(TABLE_NOTES.sessions, [
        "Psicólogo",
        "Citas",
        "Realizadas",
        "No asistió",
        "Canceladas",
        "Agendadas",
        "Reagendó",
      ]),
      psych.map((p) => [
        p.name,
        p.appointments.total,
        p.appointments.attended,
        p.appointments.noShow,
        p.appointments.cancelled,
        p.appointments.scheduled,
        p.appointments.rescheduled,
      ]),
    );
  }

  if (psych && sections.has("psych_hours")) {
    addTable(
      tableHead(TABLE_NOTES.hours, [
        "Psicólogo",
        "Pacientes",
        "Horas totales",
        "Horas terapia",
        "Horas evaluación",
        "Horas exploración",
        "Semanas reportadas",
      ]),
      psych.map((p) => [
        p.name,
        p.patientsInRange,
        p.hoursOfAttention,
        p.hoursByServiceType.THERAPY,
        p.hoursByServiceType.EVALUATION,
        p.hoursByServiceType.EXPLORATION_SESSION,
        p.weeksReported,
      ]),
    );
  }

  return doc.output("arraybuffer");
}

const NOTE_FONT = { italic: true, size: 9, color: { argb: "FF666666" } } as const;

/** Inserts a one-line description above the header row of a `columns`-based sheet. */
function addNoteAboveHeader(s: ExcelJS.Worksheet, note: string, numCols: number) {
  s.spliceRows(1, 0, [note]);
  s.mergeCells(1, 1, 1, numCols);
  s.getRow(1).font = NOTE_FONT;
  s.getRow(2).font = { bold: true };
}

/** Appends a one-line description followed by a bold header row (for sheets built via manual `addRow`s). */
function addNoteAndHeader(s: ExcelJS.Worksheet, note: string, header: string[]) {
  s.addRow([note]);
  s.mergeCells(s.rowCount, 1, s.rowCount, header.length);
  s.getRow(s.rowCount).font = NOTE_FONT;
  s.addRow(header);
  s.getRow(s.rowCount).font = { bold: true };
}

const XLSX_CHART_SIZE = 220; // px, square donut image

/** Embeds the donut chart PNG captured from the reports screen above the current row, reserving space below it. */
function addChartImage(
  wb: ExcelJS.Workbook,
  s: ExcelJS.Worksheet,
  images: Record<string, string>,
  key: string,
) {
  const img = images[key];
  if (!img) return;
  const startRow = s.rowCount;
  const imageId = wb.addImage({ base64: img, extension: "png" });
  s.addImage(imageId, {
    tl: { col: 0, row: startRow },
    ext: { width: XLSX_CHART_SIZE, height: XLSX_CHART_SIZE },
  });
  const blankRows = Math.ceil(XLSX_CHART_SIZE / 20) + 1;
  for (let i = 0; i < blankRows; i++) s.addRow([]);
}

async function buildXlsx(
  range: RangeLabel,
  sections: Set<ReportSection>,
  r: ReportData | null,
  psych: PsychologistReportRow[] | null,
  images: Record<string, string>,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema CEDAFAM";

  if (r && sections.has("patients_new")) {
    const s = wb.addWorksheet("Nuevos por período");
    s.columns = [
      { header: "Período", key: "period", width: 14 },
      { header: serviceAreaLabels.PSYCHOLOGY, key: "PSYCHOLOGY", width: 14 },
      { header: serviceAreaLabels.PSYCHIATRY, key: "PSYCHIATRY", width: 14 },
      { header: serviceAreaLabels.PSYCHOLOGICAL_EVALUATION, key: "PSYCHOLOGICAL_EVALUATION", width: 20 },
      { header: serviceAreaLabels.NEUROPSYCHOLOGICAL, key: "NEUROPSYCHOLOGICAL", width: 20 },
      { header: "Total", key: "total", width: 10 },
    ];
    r.newPatientsByPeriod.forEach((p) => s.addRow(p));
    addNoteAboveHeader(s, TABLE_NOTES.patientsNew, 6);
  }

  if (r && sections.has("patients_status")) {
    const s = wb.addWorksheet("Por estado");
    s.getColumn(1).width = 30;
    s.getColumn(2).width = 12;
    addChartImage(wb, s, images, "therapyStatus");
    addNoteAndHeader(s, TABLE_NOTES.therapyStatus, ["Estado de terapia", "Pacientes"]);
    r.patientsByTherapyStatus.forEach((x) => s.addRow([x.label, x.count]));
    s.addRow([]);
    addChartImage(wb, s, images, "psychiatryStatus");
    addNoteAndHeader(s, TABLE_NOTES.psychiatryStatus, ["Estado de psiquiatría", "Pacientes"]);
    r.patientsByPsychiatryStatus.forEach((x) => s.addRow([x.label, x.count]));
    s.addRow([]);
    addChartImage(wb, s, images, "psychEvalStatus");
    addNoteAndHeader(s, TABLE_NOTES.psychEvalStatus, [
      "Estado de evaluación psicológica",
      "Pacientes",
    ]);
    r.patientsByPsychEvaluationStatus.forEach((x) => s.addRow([x.label, x.count]));
    s.addRow([]);
    addChartImage(wb, s, images, "neuroEvalStatus");
    addNoteAndHeader(s, TABLE_NOTES.neuroEvalStatus, [
      "Estado de evaluación neuropsicológica",
      "Pacientes",
    ]);
    r.patientsByNeuroEvaluationStatus.forEach((x) => s.addRow([x.label, x.count]));
  }

  if (r && sections.has("patients_type")) {
    const s = wb.addWorksheet("Por tipo de px");
    s.getColumn(1).width = 24;
    s.getColumn(2).width = 12;
    addChartImage(wb, s, images, "patientType");
    addNoteAndHeader(s, TABLE_NOTES.patientType, ["Tipo de paciente", "Pacientes"]);
    r.patientsByType.forEach((x) => s.addRow([x.label, x.count]));
  }

  if (r && sections.has("patients_siere")) {
    const s = wb.addWorksheet("SIERE por nivel");
    s.getColumn(1).width = 24;
    s.getColumn(2).width = 12;
    addChartImage(wb, s, images, "siereLevel");
    addNoteAndHeader(s, TABLE_NOTES.siere, ["Nivel SIERE", "Pacientes"]);
    r.patientsBySiereLevel.forEach((x) => s.addRow([x.label, x.count]));
  }

  if (r && sections.has("patients_reasons")) {
    const s = wb.addWorksheet("Motivos frecuentes");
    s.columns = [
      { header: "Motivo", key: "label", width: 50 },
      { header: "Veces", key: "count", width: 10 },
    ];
    r.topReasons.forEach((x) => s.addRow(x));
    addNoteAboveHeader(s, TABLE_NOTES.reasons, 2);
  }

  if (r && sections.has("patients_indicators")) {
    const s = wb.addWorksheet("Indicadores");
    addNoteAndHeader(s, TABLE_NOTES.indicators, ["Indicador", "Valor"]);
    s.addRow(["Rango", `${range.start} a ${range.end}`]);
    s.addRow(["Pacientes nuevos en el rango", r.totals.newPatients]);
    s.addRow(["Duración promedio terapia (meses)", r.averageDuration.therapyMonths]);
    s.addRow(["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks]);
    s.addRow(["Tasa de deserción (%)", r.dropout.rate]);
    s.addRow(["Pacientes con estado", r.dropout.totalWithStatus]);
    s.addRow(["Nunca vino", r.dropout.neverCame]);
    s.addRow(["Alta voluntaria", r.dropout.voluntaryDischarge]);
  }

  if (psych && sections.has("psych_patients")) {
    const s = wb.addWorksheet("Psicólogos");
    s.columns = [
      { header: "Psicólogo", key: "name", width: 28 },
      { header: "Especialidad", key: "speciality", width: 20 },
      { header: "Modalidad", key: "workType", width: 16 },
      { header: "Pacientes activos", key: "count", width: 16 },
    ];
    psych.forEach((p) =>
      s.addRow({
        name: p.name,
        speciality: p.speciality,
        workType: p.workType,
        count: p.activePatients.length,
      }),
    );
    addNoteAboveHeader(s, TABLE_NOTES.psychSummary, 4);

    const detail = wb.addWorksheet("Pacientes por psicólogo");
    detail.columns = [
      { header: "Psicólogo", key: "psych", width: 28 },
      { header: "Paciente asignado", key: "patient", width: 32 },
    ];
    psych.forEach((p) => {
      if (p.activePatients.length === 0) {
        detail.addRow({ psych: p.name, patient: "—" });
      } else {
        p.activePatients.forEach((name) => detail.addRow({ psych: p.name, patient: name }));
      }
    });
    addNoteAboveHeader(detail, TABLE_NOTES.psychDetail, 2);
  }

  if (psych && sections.has("psych_sessions")) {
    const s = wb.addWorksheet("Citas por psicólogo");
    s.columns = [
      { header: "Psicólogo", key: "name", width: 28 },
      { header: "Citas", key: "total", width: 10 },
      { header: "Realizadas", key: "attended", width: 12 },
      { header: "No asistió", key: "noShow", width: 12 },
      { header: "Canceladas", key: "cancelled", width: 12 },
      { header: "Agendadas", key: "scheduled", width: 12 },
      { header: "Reagendó", key: "rescheduled", width: 12 },
    ];
    psych.forEach((p) => s.addRow({ name: p.name, ...p.appointments }));
    addNoteAboveHeader(s, TABLE_NOTES.sessions, 7);
  }

  if (psych && sections.has("psych_hours")) {
    const s = wb.addWorksheet("Atención por psicólogo");
    s.columns = [
      { header: "Psicólogo", key: "name", width: 28 },
      { header: "Pacientes", key: "patients", width: 12 },
      { header: "Horas totales", key: "hours", width: 14 },
      { header: "Horas terapia", key: "hoursTherapy", width: 14 },
      { header: "Horas evaluación", key: "hoursEvaluation", width: 16 },
      { header: "Horas exploración", key: "hoursExploration", width: 16 },
      { header: "Semanas reportadas", key: "weeks", width: 18 },
    ];
    psych.forEach((p) =>
      s.addRow({
        name: p.name,
        patients: p.patientsInRange,
        hours: p.hoursOfAttention,
        hoursTherapy: p.hoursByServiceType.THERAPY,
        hoursEvaluation: p.hoursByServiceType.EVALUATION,
        hoursExploration: p.hoursByServiceType.EXPLORATION_SESSION,
        weeks: p.weeksReported,
      }),
    );
    addNoteAboveHeader(s, TABLE_NOTES.hours, 7);
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
