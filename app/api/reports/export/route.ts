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
const PDF_BOTTOM_RESERVE = 18; // mm reserved for the footer on every page

// Brand palette — matches the dashboard's dark-navy theme and blue accent
// (see --primary / --card in app/globals.css) so the export feels consistent
// with the on-screen Reportes page.
const PDF_HEADER_BG = "#0f172a";
const PDF_BRAND = "#3b82f6";
const PDF_TEXT_DARK = "#0f172a";
const PDF_TEXT_MUTED = "#64748b";
const PDF_BORDER = "#e2e8f0";
const PDF_ZEBRA = "#eff6ff";

function buildPdf(
  range: RangeLabel,
  sections: Set<ReportSection>,
  r: ReportData | null,
  psych: PsychologistReportRow[] | null,
  images: Record<string, string>,
): ArrayBuffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Cover header band, only on page 1 — continuation pages get a slim strip (see footer pass below).
  doc.setFillColor(PDF_HEADER_BG);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor("#ffffff");
  doc.text("CEDAFAM", PDF_MARGIN, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#93c5fd");
  doc.text("Reporte de indicadores operativos y de atención", PDF_MARGIN, 21);
  doc.setFontSize(9);
  doc.setTextColor("#cbd5e1");
  doc.text(`Del ${range.start} al ${range.end}  ·  Generado el ${generatedAt}`, PDF_MARGIN, 27);
  doc.setTextColor(PDF_TEXT_DARK);

  let y = 40;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PDF_BOTTOM_RESERVE) {
      doc.addPage();
      y = 20;
    }
  };

  const finalY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  /** Section heading with a small brand-blue marker and a divider rule, echoing the card titles on screen. */
  const addHeading = (text: string) => {
    ensureSpace(12);
    doc.setFillColor(PDF_BRAND);
    doc.roundedRect(PDF_MARGIN, y - 3.2, 3, 3, 0.6, 0.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(PDF_TEXT_DARK);
    doc.text(text, PDF_MARGIN + 5, y);
    doc.setFont("helvetica", "normal");
    y += 3;
    doc.setDrawColor(PDF_BORDER);
    doc.setLineWidth(0.2);
    doc.line(PDF_MARGIN, y, pageWidth - PDF_MARGIN, y);
    y += 5;
  };

  /** Places the donut chart PNG captured from the reports screen, if provided. */
  const addChartImage = (key: string) => {
    const img = images[key];
    if (!img) return;
    ensureSpace(PDF_CHART_SIZE + 4);
    doc.addImage(img, "PNG", PDF_MARGIN, y, PDF_CHART_SIZE, PDF_CHART_SIZE);
    y += PDF_CHART_SIZE + 4;
  };

  const addTable = (
    head: RowInput[],
    body: RowInput[],
    opts?: { rightAlignFrom?: number },
  ) => {
    ensureSpace(20);
    const columnStyles: Record<number, { halign: "right" }> = {};
    if (opts?.rightAlignFrom !== undefined) {
      const numCols = (head[head.length - 1] as unknown as unknown[]).length;
      for (let i = opts.rightAlignFrom; i < numCols; i++) columnStyles[i] = { halign: "right" };
    }
    autoTable(doc, {
      startY: y,
      head,
      body,
      margin: { top: 20, bottom: 20, left: PDF_MARGIN, right: PDF_MARGIN },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3,
        lineColor: PDF_BORDER,
        lineWidth: 0.1,
        textColor: PDF_TEXT_DARK,
      },
      headStyles: { fillColor: PDF_BRAND, textColor: "#ffffff", fontStyle: "bold" },
      alternateRowStyles: { fillColor: PDF_ZEBRA },
      columnStyles,
    });
    y = finalY() + 10;
  };

  if (r && sections.has("patients_new")) {
    addHeading(`Pacientes nuevos por período — ${r.totals.newPatients} en el rango`);
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
      { rightAlignFrom: 1 },
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
        { rightAlignFrom: 1 },
      );
    }
  }

  if (r && sections.has("patients_type")) {
    addHeading("Pacientes por tipo");
    addChartImage("patientType");
    addTable(
      tableHead(TABLE_NOTES.patientType, ["Tipo de paciente", "Pacientes"]),
      r.patientsByType.map((s) => [s.label, s.count]),
      { rightAlignFrom: 1 },
    );
  }

  if (r && sections.has("patients_siere")) {
    addHeading("Pacientes SIERE por nivel");
    addChartImage("siereLevel");
    addTable(
      tableHead(TABLE_NOTES.siere, ["Nivel SIERE", "Pacientes"]),
      r.patientsBySiereLevel.map((s) => [s.label, s.count]),
      { rightAlignFrom: 1 },
    );
  }

  if (r && sections.has("patients_reasons")) {
    addHeading("Motivos de consulta frecuentes");
    addTable(
      tableHead(TABLE_NOTES.reasons, ["Motivo de consulta frecuente", "Veces"]),
      r.topReasons.map((s) => [s.label, s.count]),
      { rightAlignFrom: 1 },
    );
  }

  if (r && sections.has("patients_indicators")) {
    addHeading("Indicadores");
    addTable(
      tableHead(TABLE_NOTES.indicators, ["Indicador", "Valor"]),
      [
        ["Duración promedio terapia (meses)", r.averageDuration.therapyMonths],
        ["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks],
        ["Tasa de deserción (nunca vino + alta voluntaria)", `${r.dropout.rate}%`],
      ],
      { rightAlignFrom: 1 },
    );
  }

  if (psych && sections.has("psych_patients")) {
    addHeading("Psicólogos y pacientes asignados");
    addTable(
      tableHead(TABLE_NOTES.psychSummary, [
        "Psicólogo",
        "Especialidad",
        "Modalidad",
        "Pacientes activos",
      ]),
      psych.map((p) => [p.name, p.speciality, p.workType, p.activePatients.length]),
      { rightAlignFrom: 3 },
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
    addHeading("Citas por psicólogo en el rango");
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
      { rightAlignFrom: 1 },
    );
  }

  if (psych && sections.has("psych_hours")) {
    addHeading("Atención por psicólogo");
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
      { rightAlignFrom: 1 },
    );
  }

  // Footer pass — runs once all content (and any pagination autoTable triggered
  // on its own) exists, so every page gets it, including ones we never touched directly.
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFillColor(PDF_BRAND);
      doc.rect(0, 0, pageWidth, 1.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(PDF_TEXT_MUTED);
      doc.text("CEDAFAM — Reporte", PDF_MARGIN, 10);
      doc.text(`${range.start} a ${range.end}`, pageWidth - PDF_MARGIN, 10, { align: "right" });
    }
    doc.setDrawColor(PDF_BORDER);
    doc.setLineWidth(0.2);
    doc.line(PDF_MARGIN, pageHeight - 12, pageWidth - PDF_MARGIN, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF_TEXT_MUTED);
    doc.text("CEDAFAM · Sistema de gestión", PDF_MARGIN, pageHeight - 7);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - PDF_MARGIN, pageHeight - 7, {
      align: "right",
    });
  }

  return doc.output("arraybuffer");
}

// Same brand palette as the PDF (see PDF_* above), in ExcelJS's ARGB hex form.
const XLSX_HEADER_BG = "FF0F172A";
const XLSX_BRAND = "FF3B82F6";
const XLSX_BRAND_LIGHT = "FF93C5FD";
const XLSX_MUTED_LIGHT = "FFCBD5E1";
const XLSX_TEXT_MUTED = "FF64748B";
const XLSX_BORDER = "FFE2E8F0";
const XLSX_ZEBRA = "FFEFF6FF";

const NOTE_FONT = { italic: true, size: 9, color: { argb: XLSX_TEXT_MUTED } } as const;
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: XLSX_BORDER } },
  left: { style: "thin", color: { argb: XLSX_BORDER } },
  bottom: { style: "thin", color: { argb: XLSX_BORDER } },
  right: { style: "thin", color: { argb: XLSX_BORDER } },
};

/** Solid brand-blue fill + white bold text + thin borders, for a table's header row. */
function styleHeaderRow(s: ExcelJS.Worksheet, rowNumber: number, numCols: number) {
  const row = s.getRow(rowNumber);
  row.font = HEADER_FONT;
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_BRAND } };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle" };
  }
}

/** Thin borders on every data cell, plus a subtle blue tint on alternating rows. */
function styleDataRows(s: ExcelJS.Worksheet, fromRow: number, toRow: number, numCols: number) {
  for (let row = fromRow; row <= toRow; row++) {
    const isAlt = (row - fromRow) % 2 === 1;
    for (let c = 1; c <= numCols; c++) {
      const cell = s.getRow(row).getCell(c);
      cell.border = THIN_BORDER;
      if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_ZEBRA } };
    }
  }
}

/** Runs `populate` (one or more `s.addRow(...)` calls) and styles whatever rows it added. */
function addStyledRows(s: ExcelJS.Worksheet, numCols: number, populate: () => void) {
  const from = s.rowCount + 1;
  populate();
  styleDataRows(s, from, s.rowCount, numCols);
}

/** Inserts a one-line description above the header row of a `columns`-based sheet. */
function addNoteAboveHeader(s: ExcelJS.Worksheet, note: string, numCols: number) {
  s.spliceRows(1, 0, [note]);
  s.mergeCells(1, 1, 1, numCols);
  s.getRow(1).font = NOTE_FONT;
  styleHeaderRow(s, 2, numCols);
}

/** Appends a one-line description followed by a branded header row (for sheets built via manual `addRow`s). */
function addNoteAndHeader(s: ExcelJS.Worksheet, note: string, header: string[]) {
  s.addRow([note]);
  s.mergeCells(s.rowCount, 1, s.rowCount, header.length);
  s.getRow(s.rowCount).font = NOTE_FONT;
  s.addRow(header);
  styleHeaderRow(s, s.rowCount, header.length);
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

/** Brand navy banner (title + subtitle + date range) spanning the sheet's width, echoing the PDF cover. */
function addBrandBanner(s: ExcelJS.Worksheet, numCols: number, range: RangeLabel, generatedAt: string) {
  const rows: [string, typeof HEADER_FONT | { italic?: boolean; color: { argb: string } }, number][] = [
    ["CEDAFAM", { bold: true, color: { argb: "FFFFFFFF" } }, 16],
    ["Reporte de indicadores operativos y de atención", { color: { argb: XLSX_BRAND_LIGHT } }, 11],
    [`Del ${range.start} al ${range.end}  ·  Generado el ${generatedAt}`, { color: { argb: XLSX_MUTED_LIGHT } }, 9],
  ];
  for (const [text, font, size] of rows) {
    s.addRow([text]);
    const rowNumber = s.rowCount;
    s.mergeCells(rowNumber, 1, rowNumber, numCols);
    const row = s.getRow(rowNumber);
    row.font = { ...font, size };
    row.height = size + 8;
    for (let c = 1; c <= numCols; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_HEADER_BG } };
    }
  }
  s.addRow([]);
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
  const generatedAt = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (r || psych) {
    const cover = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
    cover.getColumn(1).width = 34;
    cover.getColumn(2).width = 20;
    addBrandBanner(cover, 2, range, generatedAt);
    if (r) {
      addNoteAndHeader(cover, TABLE_NOTES.indicators, ["Indicador", "Valor"]);
      addStyledRows(cover, 2, () => {
        cover.addRow(["Pacientes nuevos en el rango", r.totals.newPatients]);
        cover.addRow(["Tasa de deserción", `${r.dropout.rate}%`]);
        cover.addRow(["Duración promedio terapia (meses)", r.averageDuration.therapyMonths]);
        cover.addRow(["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks]);
      });
    }
  }

  if (r && sections.has("patients_new")) {
    const s = wb.addWorksheet("Nuevos por período", { views: [{ showGridLines: false }] });
    s.columns = [
      { header: "Período", key: "period", width: 14 },
      { header: serviceAreaLabels.PSYCHOLOGY, key: "PSYCHOLOGY", width: 14 },
      { header: serviceAreaLabels.PSYCHIATRY, key: "PSYCHIATRY", width: 14 },
      { header: serviceAreaLabels.PSYCHOLOGICAL_EVALUATION, key: "PSYCHOLOGICAL_EVALUATION", width: 20 },
      { header: serviceAreaLabels.NEUROPSYCHOLOGICAL, key: "NEUROPSYCHOLOGICAL", width: 20 },
      { header: "Total", key: "total", width: 10 },
    ];
    addStyledRows(s, 6, () => r.newPatientsByPeriod.forEach((p) => s.addRow(p)));
    addNoteAboveHeader(s, TABLE_NOTES.patientsNew, 6);
  }

  if (r && sections.has("patients_status")) {
    const s = wb.addWorksheet("Por estado", { views: [{ showGridLines: false }] });
    s.getColumn(1).width = 30;
    s.getColumn(2).width = 12;
    addChartImage(wb, s, images, "therapyStatus");
    addNoteAndHeader(s, TABLE_NOTES.therapyStatus, ["Estado de terapia", "Pacientes"]);
    addStyledRows(s, 2, () => r.patientsByTherapyStatus.forEach((x) => s.addRow([x.label, x.count])));
    s.addRow([]);
    addChartImage(wb, s, images, "psychiatryStatus");
    addNoteAndHeader(s, TABLE_NOTES.psychiatryStatus, ["Estado de psiquiatría", "Pacientes"]);
    addStyledRows(s, 2, () => r.patientsByPsychiatryStatus.forEach((x) => s.addRow([x.label, x.count])));
    s.addRow([]);
    addChartImage(wb, s, images, "psychEvalStatus");
    addNoteAndHeader(s, TABLE_NOTES.psychEvalStatus, [
      "Estado de evaluación psicológica",
      "Pacientes",
    ]);
    addStyledRows(s, 2, () =>
      r.patientsByPsychEvaluationStatus.forEach((x) => s.addRow([x.label, x.count])),
    );
    s.addRow([]);
    addChartImage(wb, s, images, "neuroEvalStatus");
    addNoteAndHeader(s, TABLE_NOTES.neuroEvalStatus, [
      "Estado de evaluación neuropsicológica",
      "Pacientes",
    ]);
    addStyledRows(s, 2, () =>
      r.patientsByNeuroEvaluationStatus.forEach((x) => s.addRow([x.label, x.count])),
    );
  }

  if (r && sections.has("patients_type")) {
    const s = wb.addWorksheet("Por tipo de px", { views: [{ showGridLines: false }] });
    s.getColumn(1).width = 24;
    s.getColumn(2).width = 12;
    addChartImage(wb, s, images, "patientType");
    addNoteAndHeader(s, TABLE_NOTES.patientType, ["Tipo de paciente", "Pacientes"]);
    addStyledRows(s, 2, () => r.patientsByType.forEach((x) => s.addRow([x.label, x.count])));
  }

  if (r && sections.has("patients_siere")) {
    const s = wb.addWorksheet("SIERE por nivel", { views: [{ showGridLines: false }] });
    s.getColumn(1).width = 24;
    s.getColumn(2).width = 12;
    addChartImage(wb, s, images, "siereLevel");
    addNoteAndHeader(s, TABLE_NOTES.siere, ["Nivel SIERE", "Pacientes"]);
    addStyledRows(s, 2, () => r.patientsBySiereLevel.forEach((x) => s.addRow([x.label, x.count])));
  }

  if (r && sections.has("patients_reasons")) {
    const s = wb.addWorksheet("Motivos frecuentes", { views: [{ showGridLines: false }] });
    s.columns = [
      { header: "Motivo", key: "label", width: 50 },
      { header: "Veces", key: "count", width: 10 },
    ];
    addStyledRows(s, 2, () => r.topReasons.forEach((x) => s.addRow(x)));
    addNoteAboveHeader(s, TABLE_NOTES.reasons, 2);
  }

  if (r && sections.has("patients_indicators")) {
    const s = wb.addWorksheet("Indicadores", { views: [{ showGridLines: false }] });
    addNoteAndHeader(s, TABLE_NOTES.indicators, ["Indicador", "Valor"]);
    addStyledRows(s, 2, () => {
      s.addRow(["Rango", `${range.start} a ${range.end}`]);
      s.addRow(["Pacientes nuevos en el rango", r.totals.newPatients]);
      s.addRow(["Duración promedio terapia (meses)", r.averageDuration.therapyMonths]);
      s.addRow(["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks]);
      s.addRow(["Tasa de deserción (%)", r.dropout.rate]);
      s.addRow(["Pacientes con estado", r.dropout.totalWithStatus]);
      s.addRow(["Nunca vino", r.dropout.neverCame]);
      s.addRow(["Alta voluntaria", r.dropout.voluntaryDischarge]);
    });
  }

  if (psych && sections.has("psych_patients")) {
    const s = wb.addWorksheet("Psicólogos", { views: [{ showGridLines: false }] });
    s.columns = [
      { header: "Psicólogo", key: "name", width: 28 },
      { header: "Especialidad", key: "speciality", width: 20 },
      { header: "Modalidad", key: "workType", width: 16 },
      { header: "Pacientes activos", key: "count", width: 16 },
    ];
    addStyledRows(s, 4, () =>
      psych.forEach((p) =>
        s.addRow({
          name: p.name,
          speciality: p.speciality,
          workType: p.workType,
          count: p.activePatients.length,
        }),
      ),
    );
    addNoteAboveHeader(s, TABLE_NOTES.psychSummary, 4);

    const detail = wb.addWorksheet("Pacientes por psicólogo", { views: [{ showGridLines: false }] });
    detail.columns = [
      { header: "Psicólogo", key: "psych", width: 28 },
      { header: "Paciente asignado", key: "patient", width: 32 },
    ];
    addStyledRows(detail, 2, () => {
      psych.forEach((p) => {
        if (p.activePatients.length === 0) {
          detail.addRow({ psych: p.name, patient: "—" });
        } else {
          p.activePatients.forEach((name) => detail.addRow({ psych: p.name, patient: name }));
        }
      });
    });
    addNoteAboveHeader(detail, TABLE_NOTES.psychDetail, 2);
  }

  if (psych && sections.has("psych_sessions")) {
    const s = wb.addWorksheet("Citas por psicólogo", { views: [{ showGridLines: false }] });
    s.columns = [
      { header: "Psicólogo", key: "name", width: 28 },
      { header: "Citas", key: "total", width: 10 },
      { header: "Realizadas", key: "attended", width: 12 },
      { header: "No asistió", key: "noShow", width: 12 },
      { header: "Canceladas", key: "cancelled", width: 12 },
      { header: "Agendadas", key: "scheduled", width: 12 },
      { header: "Reagendó", key: "rescheduled", width: 12 },
    ];
    addStyledRows(s, 7, () => psych.forEach((p) => s.addRow({ name: p.name, ...p.appointments })));
    addNoteAboveHeader(s, TABLE_NOTES.sessions, 7);
  }

  if (psych && sections.has("psych_hours")) {
    const s = wb.addWorksheet("Atención por psicólogo", { views: [{ showGridLines: false }] });
    s.columns = [
      { header: "Psicólogo", key: "name", width: 28 },
      { header: "Pacientes", key: "patients", width: 12 },
      { header: "Horas totales", key: "hours", width: 14 },
      { header: "Horas terapia", key: "hoursTherapy", width: 14 },
      { header: "Horas evaluación", key: "hoursEvaluation", width: 16 },
      { header: "Horas exploración", key: "hoursExploration", width: 16 },
      { header: "Semanas reportadas", key: "weeks", width: 18 },
    ];
    addStyledRows(s, 7, () =>
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
      ),
    );
    addNoteAboveHeader(s, TABLE_NOTES.hours, 7);
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
