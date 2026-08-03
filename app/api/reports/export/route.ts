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

/**
 * GET /api/reports/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=pdf|xlsx&sections=a,b,c
 * `sections` picks which report blocks to include (see lib/report-sections.ts);
 * missing → all.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("reports:read");
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams.get("start"), searchParams.get("end"));
  if (!range) {
    return Response.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  const format = searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const sections = parseSections(searchParams.get("sections"));

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
    const bytes = buildPdf(rangeLabel, sections, report, psychRows);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-cedafam-${filenameRange}.pdf"`,
      },
    });
  }

  const buffer = await buildXlsx(rangeLabel, sections, report, psychRows);
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

function buildPdf(
  range: RangeLabel,
  sections: Set<ReportSection>,
  r: ReportData | null,
  psych: PsychologistReportRow[] | null,
): ArrayBuffer {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`CEDAFAM — Reporte (${range.start} a ${range.end})`, 14, 18);
  let startY = 26;

  if (r && sections.has("patients_new")) {
    doc.setFontSize(10);
    doc.text(`Pacientes nuevos en el rango: ${r.totals.newPatients}`, 14, startY);
    startY += 6;
    autoTable(doc, {
      startY,
      head: tableHead(TABLE_NOTES.patientsNew, [
        "Período",
        "Psicología",
        "Psiquiatría",
        "Evaluación",
        "Neuropsicológica",
        "Total",
      ]),
      body: r.newPatientsByPeriod.map((p) => [
        p.period,
        p.PSYCHOLOGY,
        p.PSYCHIATRY,
        p.PSYCHOLOGICAL_EVALUATION,
        p.NEUROPSYCHOLOGICAL,
        p.total,
      ]),
    });
    startY = 0; // subsequent tables flow below automatically
  }

  if (r && sections.has("patients_status")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.therapyStatus, ["Estado de terapia", "Pacientes"]),
      body: r.patientsByTherapyStatus.map((s) => [s.label, s.count]),
    });
    startY = 0;
    autoTable(doc, {
      head: tableHead(TABLE_NOTES.psychiatryStatus, ["Estado de psiquiatría", "Pacientes"]),
      body: r.patientsByPsychiatryStatus.map((s) => [s.label, s.count]),
    });
    autoTable(doc, {
      head: tableHead(TABLE_NOTES.psychEvalStatus, [
        "Estado de evaluación psicológica",
        "Pacientes",
      ]),
      body: r.patientsByPsychEvaluationStatus.map((s) => [s.label, s.count]),
    });
    autoTable(doc, {
      head: tableHead(TABLE_NOTES.neuroEvalStatus, [
        "Estado de evaluación neuropsicológica",
        "Pacientes",
      ]),
      body: r.patientsByNeuroEvaluationStatus.map((s) => [s.label, s.count]),
    });
  }

  if (r && sections.has("patients_type")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.patientType, ["Tipo de paciente", "Pacientes"]),
      body: r.patientsByType.map((s) => [s.label, s.count]),
    });
    startY = 0;
  }

  if (r && sections.has("patients_siere")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.siere, ["Nivel SIERE", "Pacientes"]),
      body: r.patientsBySiereLevel.map((s) => [s.label, s.count]),
    });
    startY = 0;
  }

  if (r && sections.has("patients_reasons")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.reasons, ["Motivo de consulta frecuente", "Veces"]),
      body: r.topReasons.map((s) => [s.label, s.count]),
    });
    startY = 0;
  }

  if (r && sections.has("patients_indicators")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.indicators, ["Indicador", "Valor"]),
      body: [
        ["Duración promedio terapia (meses)", r.averageDuration.therapyMonths],
        ["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks],
        ["Tasa de deserción (nunca vino + alta voluntaria)", `${r.dropout.rate}%`],
      ],
    });
    startY = 0;
  }

  if (psych && sections.has("psych_patients")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.psychSummary, [
        "Psicólogo",
        "Especialidad",
        "Modalidad",
        "Pacientes activos",
      ]),
      body: psych.map((p) => [p.name, p.speciality, p.workType, p.activePatients.length]),
    });
    startY = 0;
    autoTable(doc, {
      head: tableHead(TABLE_NOTES.psychDetail, ["Psicólogo", "Paciente asignado"]),
      body: psych.flatMap((p) =>
        p.activePatients.length === 0
          ? [[p.name, "—"]]
          : p.activePatients.map((name) => [p.name, name]),
      ),
    });
  }

  if (psych && sections.has("psych_sessions")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.sessions, [
        "Psicólogo",
        "Citas",
        "Realizadas",
        "No asistió",
        "Canceladas",
        "Agendadas",
        "Reagendó",
      ]),
      body: psych.map((p) => [
        p.name,
        p.appointments.total,
        p.appointments.attended,
        p.appointments.noShow,
        p.appointments.cancelled,
        p.appointments.scheduled,
        p.appointments.rescheduled,
      ]),
    });
    startY = 0;
  }

  if (psych && sections.has("psych_hours")) {
    autoTable(doc, {
      ...(startY ? { startY } : {}),
      head: tableHead(TABLE_NOTES.hours, [
        "Psicólogo",
        "Pacientes",
        "Horas totales",
        "Horas terapia",
        "Horas evaluación",
        "Horas exploración",
        "Semanas reportadas",
      ]),
      body: psych.map((p) => [
        p.name,
        p.patientsInRange,
        p.hoursOfAttention,
        p.hoursByServiceType.THERAPY,
        p.hoursByServiceType.EVALUATION,
        p.hoursByServiceType.EXPLORATION_SESSION,
        p.weeksReported,
      ]),
    });
    startY = 0;
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

async function buildXlsx(
  range: RangeLabel,
  sections: Set<ReportSection>,
  r: ReportData | null,
  psych: PsychologistReportRow[] | null,
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
    addNoteAndHeader(s, TABLE_NOTES.therapyStatus, ["Estado de terapia", "Pacientes"]);
    r.patientsByTherapyStatus.forEach((x) => s.addRow([x.label, x.count]));
    s.addRow([]);
    addNoteAndHeader(s, TABLE_NOTES.psychiatryStatus, ["Estado de psiquiatría", "Pacientes"]);
    r.patientsByPsychiatryStatus.forEach((x) => s.addRow([x.label, x.count]));
    s.addRow([]);
    addNoteAndHeader(s, TABLE_NOTES.psychEvalStatus, [
      "Estado de evaluación psicológica",
      "Pacientes",
    ]);
    r.patientsByPsychEvaluationStatus.forEach((x) => s.addRow([x.label, x.count]));
    s.addRow([]);
    addNoteAndHeader(s, TABLE_NOTES.neuroEvalStatus, [
      "Estado de evaluación neuropsicológica",
      "Pacientes",
    ]);
    r.patientsByNeuroEvaluationStatus.forEach((x) => s.addRow([x.label, x.count]));
  }

  if (r && sections.has("patients_type")) {
    const s = wb.addWorksheet("Por tipo de px");
    s.columns = [
      { header: "Tipo de paciente", key: "label", width: 24 },
      { header: "Pacientes", key: "count", width: 12 },
    ];
    r.patientsByType.forEach((x) => s.addRow(x));
    addNoteAboveHeader(s, TABLE_NOTES.patientType, 2);
  }

  if (r && sections.has("patients_siere")) {
    const s = wb.addWorksheet("SIERE por nivel");
    s.columns = [
      { header: "Nivel SIERE", key: "label", width: 24 },
      { header: "Pacientes", key: "count", width: 12 },
    ];
    r.patientsBySiereLevel.forEach((x) => s.addRow(x));
    addNoteAboveHeader(s, TABLE_NOTES.siere, 2);
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
