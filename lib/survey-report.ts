import { db } from "@/lib/db";
import { endOfMxDay, mxSlotStart } from "@/lib/utils";
import {
  SURVEY_QUESTIONS,
  optionsFor,
  type SurveyAnswers,
} from "@/lib/survey";

export interface SurveyOptionCount {
  value: string;
  label: string;
  color: string;
  count: number;
  /** Porcentaje sobre las respuestas de esa pregunta, redondeado a un decimal. */
  percent: number;
}

export interface SurveyQuestionReport {
  id: string;
  text: string;
  /** Respuestas recibidas para esta pregunta (excluye las que la omitieron). */
  answered: number;
  options: SurveyOptionCount[];
  /** Promedio 1–3 en escalas de satisfacción; `null` en las demás. */
  averageScore: number | null;
}

export interface SurveyReport {
  from: string | null;
  to: string | null;
  totalResponses: number;
  /** Promedio de satisfacción de todas las preguntas puntuables, 1–3. */
  overallSatisfaction: number | null;
  questions: SurveyQuestionReport[];
}

/**
 * Agrega las respuestas de la encuesta en el rango dado.
 *
 * Las preguntas se recorren desde `lib/survey.ts`, no desde los datos: si una
 * pregunta se retiró de la configuración, sus respuestas históricas dejan de
 * reportarse, y si se añadió una nueva, las respuestas viejas simplemente no
 * la traen. Por eso cada pregunta lleva su propio `answered` en vez de asumir
 * el total.
 */
export async function buildSurveyReport(
  from: Date | null,
  to: Date | null,
): Promise<SurveyReport> {
  const responses = await db.surveyResponse.findMany({
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
    select: { answers: true },
  });

  const answerSets = responses.map((r) => (r.answers ?? {}) as SurveyAnswers);

  const questions: SurveyQuestionReport[] = SURVEY_QUESTIONS.map((q) => {
    const options = optionsFor(q);
    const counts = new Map<string, number>();
    let answered = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    for (const set of answerSets) {
      const value = set[q.id];
      if (!value) continue;
      const option = options.find((o) => o.value === value);
      // Un valor que ya no existe en la escala se ignora en vez de romper el
      // reporte; pasa si se reescribieron las opciones.
      if (!option) continue;

      answered += 1;
      counts.set(value, (counts.get(value) ?? 0) + 1);
      if (option.score !== undefined) {
        scoreSum += option.score;
        scoreCount += 1;
      }
    }

    return {
      id: q.id,
      text: q.text,
      answered,
      options: options.map((o) => {
        const count = counts.get(o.value) ?? 0;
        return {
          value: o.value,
          label: o.label,
          color: o.color,
          count,
          percent: answered === 0 ? 0 : Number(((count / answered) * 100).toFixed(1)),
        };
      }),
      averageScore:
        scoreCount === 0 ? null : Number((scoreSum / scoreCount).toFixed(2)),
    };
  });

  const scored = questions.filter((q) => q.averageScore !== null);
  const overallSatisfaction =
    scored.length === 0
      ? null
      : Number(
          (
            scored.reduce((acc, q) => acc + (q.averageScore ?? 0), 0) /
            scored.length
          ).toFixed(2),
        );

  return {
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    totalResponses: responses.length,
    overallSatisfaction,
    questions,
  };
}

/**
 * Lee `from`/`to` ("yyyy-MM-dd") de la query y los convierte a instantes.
 *
 * Los días se interpretan en hora de Ciudad de México, no en la del servidor
 * —que en Vercel es UTC—, para que "del 1 al 5" cubra exactamente esos cinco
 * días naturales tal como los vive la clínica. `to` se lleva al final del día
 * para que lo contestado el día 5 quede incluido.
 */
export function parseRange(searchParams: URLSearchParams): {
  from: Date | null;
  to: Date | null;
} {
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const isDay = (v: string | null): v is string =>
    !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const from = isDay(fromRaw) ? mxSlotStart(fromRaw, "00:00") : null;
  const to = isDay(toRaw) ? endOfMxDay(mxSlotStart(toRaw, "00:00")) : null;

  return {
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null,
  };
}
