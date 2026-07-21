import { z } from "zod";

/**
 * Encuesta de satisfacción — Coordinación Innovación e Investigación.
 *
 * Las preguntas viven aquí y no en el esquema: las respuestas se guardan como
 * un mapa `{ preguntaId: valor }` en una columna Json, así que añadir, quitar o
 * reescribir una pregunta es editar este archivo. El formulario público, las
 * gráficas y la exportación a Excel se generan recorriendo esta configuración.
 *
 * Al retirar una pregunta, las respuestas viejas conservan su valor en la base
 * pero dejan de mostrarse. Al añadir una, las respuestas anteriores no la
 * traen y se cuentan como "sin responder".
 */

export type SurveyScale = "SATISFACTION" | "YES_NO_SOMETIMES" | "YES_NO";

export interface SurveyOption {
  /** Lo que se guarda en la base; no cambiarlo rompe la lectura del histórico. */
  value: string;
  label: string;
  /** Color del segmento en las gráficas. */
  color: string;
  /**
   * Puntaje para promediar satisfacción. Solo lo traen las escalas donde
   * "mejor" y "peor" tienen sentido; en un sí/no descriptivo no lo tiene.
   */
  score?: number;
}

export const SURVEY_SCALES: Record<SurveyScale, SurveyOption[]> = {
  SATISFACTION: [
    { value: "VERY_SATISFIED", label: "Muy satisfecho", color: "#10b981", score: 3 },
    { value: "SATISFIED", label: "Satisfecho", color: "#3b82f6", score: 2 },
    { value: "UNSATISFIED", label: "Insatisfecho", color: "#ef4444", score: 1 },
  ],
  YES_NO_SOMETIMES: [
    { value: "YES", label: "Sí", color: "#10b981" },
    { value: "NO", label: "No", color: "#ef4444" },
    { value: "SOMETIMES", label: "A veces", color: "#f59e0b" },
  ],
  YES_NO: [
    { value: "YES", label: "Sí", color: "#10b981" },
    { value: "NO", label: "No", color: "#ef4444" },
  ],
};

export interface SurveyQuestion {
  /** Clave con la que se guarda la respuesta. Estable: no renombrar. */
  id: string;
  text: string;
  scale: SurveyScale;
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "reception_attention",
    text: "La atención en la recepción fue con amabilidad, obtuve la información y atención que requería.",
    scale: "SATISFACTION",
  },
  {
    id: "reception_scheduling",
    text: "El trabajo de recepción al agendar mis consultas es satisfactorio.",
    scale: "SATISFACTION",
  },
  {
    id: "facilities",
    text: "Las instalaciones son cómodas y agradables. Se adaptan a mis necesidades como consultante.",
    scale: "SATISFACTION",
  },
  {
    id: "good_treatment",
    text: "Recibo un buen trato de parte de todos los profesionales en CEDAFAM.",
    scale: "YES_NO_SOMETIMES",
  },
  {
    id: "five_or_more_sessions",
    text: "He tenido 5 sesiones o más en el CEDAFAM.",
    scale: "YES_NO",
  },
  {
    id: "first_time",
    text: "Es mi primera vez en CEDAFAM.",
    scale: "YES_NO",
  },
];

export function optionsFor(question: SurveyQuestion): SurveyOption[] {
  return SURVEY_SCALES[question.scale];
}

export function optionLabel(question: SurveyQuestion, value: string): string {
  return optionsFor(question).find((o) => o.value === value)?.label ?? value;
}

/**
 * Validador derivado de la configuración: exige una respuesta por pregunta y
 * que el valor pertenezca a su escala. Al editar `SURVEY_QUESTIONS` el
 * validador se ajusta solo.
 */
export const surveyResponseSchema = z.object(
  Object.fromEntries(
    SURVEY_QUESTIONS.map((q) => [
      q.id,
      z.enum(
        optionsFor(q).map((o) => o.value) as [string, ...string[]],
        { errorMap: () => ({ message: "Selecciona una respuesta" }) },
      ),
    ]),
  ) as Record<string, z.ZodEnum<[string, ...string[]]>>,
);

export type SurveyAnswers = Record<string, string>;
