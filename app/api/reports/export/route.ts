import { type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth";
import { buildReport, type ReportData } from "@/lib/reports";
import { parseDateRange } from "@/lib/report-range";
import { serviceAreaLabels } from "@/lib/labels";

export const runtime = "nodejs";

/** GET /api/reports/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=pdf|xlsx */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("reports:read");
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const range = parseDateRange(searchParams.get("start"), searchParams.get("end"));
  if (!range) {
    return Response.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  const format = searchParams.get("format") === "pdf" ? "pdf" : "xlsx";

  const report = await buildReport(range.start, addDays(range.end, 1));
  const filenameRange = `${report.range.start}_a_${report.range.end}`;

  if (format === "pdf") {
    const bytes = buildPdf(report);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-cedafam-${filenameRange}.pdf"`,
      },
    });
  }

  const buffer = await buildXlsx(report);
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reporte-cedafam-${filenameRange}.xlsx"`,
    },
  });
}

function buildPdf(r: ReportData): ArrayBuffer {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`CEDAFAM — Reporte (${r.range.start} a ${r.range.end})`, 14, 18);
  doc.setFontSize(10);
  doc.text(`Pacientes nuevos en el rango: ${r.totals.newPatients}`, 14, 26);

  autoTable(doc, {
    startY: 32,
    head: [["Período", "Psicología", "Psiquiatría", "Evaluación", "Neuropsicológica", "Total"]],
    body: r.newPatientsByPeriod.map((p) => [
      p.period,
      p.PSYCHOLOGY,
      p.PSYCHIATRY,
      p.PSYCHOLOGICAL_EVALUATION,
      p.NEUROPSYCHOLOGICAL,
      p.total,
    ]),
  });

  autoTable(doc, {
    head: [["Estado de terapia", "Pacientes"]],
    body: r.patientsByTherapyStatus.map((s) => [s.label, s.count]),
  });

  autoTable(doc, {
    head: [["Estado de psiquiatría", "Pacientes"]],
    body: r.patientsByPsychiatryStatus.map((s) => [s.label, s.count]),
  });

  autoTable(doc, {
    head: [["Estado de evaluación psicológica", "Pacientes"]],
    body: r.patientsByPsychEvaluationStatus.map((s) => [s.label, s.count]),
  });

  autoTable(doc, {
    head: [["Estado de evaluación neuropsicológica", "Pacientes"]],
    body: r.patientsByNeuroEvaluationStatus.map((s) => [s.label, s.count]),
  });

  autoTable(doc, {
    head: [["Tipo de paciente", "Pacientes"]],
    body: r.patientsByType.map((s) => [s.label, s.count]),
  });

  autoTable(doc, {
    head: [["Motivo de consulta frecuente", "Veces"]],
    body: r.topReasons.map((s) => [s.label, s.count]),
  });

  autoTable(doc, {
    head: [["Indicador", "Valor"]],
    body: [
      ["Duración promedio terapia (meses)", r.averageDuration.therapyMonths],
      ["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks],
      ["Tasa de deserción (nunca vino + alta voluntaria)", `${r.dropout.rate}%`],
    ],
  });

  return doc.output("arraybuffer");
}

async function buildXlsx(r: ReportData): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema CEDAFAM";

  const s1 = wb.addWorksheet("Nuevos por período");
  s1.columns = [
    { header: "Período", key: "period", width: 14 },
    { header: serviceAreaLabels.PSYCHOLOGY, key: "PSYCHOLOGY", width: 14 },
    { header: serviceAreaLabels.PSYCHIATRY, key: "PSYCHIATRY", width: 14 },
    { header: serviceAreaLabels.PSYCHOLOGICAL_EVALUATION, key: "PSYCHOLOGICAL_EVALUATION", width: 20 },
    { header: serviceAreaLabels.NEUROPSYCHOLOGICAL, key: "NEUROPSYCHOLOGICAL", width: 20 },
    { header: "Total", key: "total", width: 10 },
  ];
  r.newPatientsByPeriod.forEach((p) => s1.addRow(p));

  const s2 = wb.addWorksheet("Por estado");
  s2.addRow(["Estado de terapia", "Pacientes"]);
  r.patientsByTherapyStatus.forEach((x) => s2.addRow([x.label, x.count]));
  s2.addRow([]);
  s2.addRow(["Estado de psiquiatría", "Pacientes"]);
  r.patientsByPsychiatryStatus.forEach((x) => s2.addRow([x.label, x.count]));
  s2.addRow([]);
  s2.addRow(["Estado de evaluación psicológica", "Pacientes"]);
  r.patientsByPsychEvaluationStatus.forEach((x) => s2.addRow([x.label, x.count]));
  s2.addRow([]);
  s2.addRow(["Estado de evaluación neuropsicológica", "Pacientes"]);
  r.patientsByNeuroEvaluationStatus.forEach((x) => s2.addRow([x.label, x.count]));

  const sType = wb.addWorksheet("Por tipo de px");
  sType.columns = [
    { header: "Tipo de paciente", key: "label", width: 24 },
    { header: "Pacientes", key: "count", width: 12 },
  ];
  r.patientsByType.forEach((x) => sType.addRow(x));

  const s3 = wb.addWorksheet("Motivos frecuentes");
  s3.columns = [
    { header: "Motivo", key: "label", width: 50 },
    { header: "Veces", key: "count", width: 10 },
  ];
  r.topReasons.forEach((x) => s3.addRow(x));

  const s4 = wb.addWorksheet("Indicadores");
  s4.addRow(["Indicador", "Valor"]);
  s4.addRow(["Rango", `${r.range.start} a ${r.range.end}`]);
  s4.addRow(["Duración promedio terapia (meses)", r.averageDuration.therapyMonths]);
  s4.addRow(["Duración promedio evaluación (semanas)", r.averageDuration.evaluationWeeks]);
  s4.addRow(["Tasa de deserción (%)", r.dropout.rate]);
  s4.addRow(["Pacientes con estado", r.dropout.totalWithStatus]);
  s4.addRow(["Nunca vino", r.dropout.neverCame]);
  s4.addRow(["Alta voluntaria", r.dropout.voluntaryDischarge]);

  [s1, s2, sType, s3, s4].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true };
  });

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
