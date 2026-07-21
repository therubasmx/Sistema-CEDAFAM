import { type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { Position } from "@prisma/client";
import { db } from "@/lib/db";
import { requireViewPosition } from "@/lib/api-auth";
import { buildSurveyReport, parseRange } from "@/lib/survey-report";
import { SURVEY_QUESTIONS, optionLabel, type SurveyAnswers } from "@/lib/survey";

export const runtime = "nodejs";

/**
 * GET /api/surveys/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Excel con dos hojas: el resumen que se ve en las gráficas y las respuestas
 * una por renglón, por si la coordinación quiere cruzarlas por su cuenta.
 */
export async function GET(req: NextRequest) {
  const guard = await requireViewPosition(Position.INNOVATION_RESEARCH);
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const { from, to } = parseRange(searchParams);

  const [report, responses] = await Promise.all([
    buildSurveyReport(from, to),
    db.surveyResponse.findMany({
      where: {
        ...(from || to
          ? {
              submittedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { submittedAt: "asc" },
      select: { submittedAt: true, answers: true },
    }),
  ]);

  const wb = new ExcelJS.Workbook();

  // ── Hoja 1: resumen por pregunta ──────────────────────────────
  const summary = wb.addWorksheet("Resumen");
  summary.addRow(["Encuesta de satisfacción — CEDAFAM"]);
  summary.addRow([
    "Periodo",
    from ? format(from, "yyyy-MM-dd") : "Desde el inicio",
    to ? format(to, "yyyy-MM-dd") : "Hasta hoy",
  ]);
  summary.addRow(["Respuestas totales", report.totalResponses]);
  summary.addRow([
    "Satisfacción promedio (1–3)",
    report.overallSatisfaction ?? "Sin datos",
  ]);
  summary.addRow([]);
  summary.addRow(["Pregunta", "Respuesta", "Conteo", "Porcentaje"]);
  summary.getRow(6).font = { bold: true };

  for (const q of report.questions) {
    for (const o of q.options) {
      summary.addRow([q.text, o.label, o.count, `${o.percent}%`]);
    }
    summary.addRow([]);
  }
  summary.getColumn(1).width = 70;
  summary.getColumn(2).width = 18;

  // ── Hoja 2: respuestas individuales ───────────────────────────
  const raw = wb.addWorksheet("Respuestas");
  raw.addRow(["Fecha", ...SURVEY_QUESTIONS.map((q) => q.text)]);
  raw.getRow(1).font = { bold: true };

  for (const r of responses) {
    const answers = (r.answers ?? {}) as SurveyAnswers;
    raw.addRow([
      format(r.submittedAt, "yyyy-MM-dd HH:mm"),
      ...SURVEY_QUESTIONS.map((q) =>
        answers[q.id] ? optionLabel(q, answers[q.id]) : "—",
      ),
    ]);
  }
  raw.getColumn(1).width = 18;
  SURVEY_QUESTIONS.forEach((_, i) => {
    raw.getColumn(i + 2).width = 28;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const suffix = [
    from ? format(from, "yyyyMMdd") : "inicio",
    to ? format(to, "yyyyMMdd") : "hoy",
  ].join("-");

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="encuesta-cedafam-${suffix}.xlsx"`,
    },
  });
}
