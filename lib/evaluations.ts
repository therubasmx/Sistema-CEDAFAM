import { Prisma, ServiceArea } from "@prisma/client";

/**
 * Áreas de servicio que se atienden como evaluación. Solo los pacientes que
 * caen en una de ellas llevan folio de evaluación: el resto va a terapia o a
 * psiquiatría, donde no hay entrega de resultados que foliar.
 */
export const EVALUATION_SERVICE_AREAS: ServiceArea[] = [
  ServiceArea.PSYCHOLOGICAL_EVALUATION,
  ServiceArea.NEUROPSYCHOLOGICAL,
];

export function isEvaluationServiceArea(area: ServiceArea): boolean {
  return EVALUATION_SERVICE_AREAS.includes(area);
}

/**
 * Primer folio que emite el sistema. El centro ya llevaba el consecutivo en
 * papel hasta el 205, así que el sistema continúa la misma numeración en vez
 * de empezar de cero — el folio tiene que seguir sirviendo para buscar
 * expedientes anteriores.
 */
export const FIRST_EVALUATION_FOLIO = 206;

/** Siguiente folio dado el mayor emitido hasta ahora (`null` si no hay ninguno). */
export function nextEvaluationFolio(lastFolio: number | null): number {
  if (lastFolio === null) return FIRST_EVALUATION_FOLIO;
  return Math.max(lastFolio + 1, FIRST_EVALUATION_FOLIO);
}

/** Datos que necesita el módulo de Evaluaciones para pintar un folio. */
export const evaluationFolioInclude = {
  patient: {
    select: { id: true, fullName: true, fileNumber: true, serviceArea: true },
  },
  evaluator: { select: { id: true, name: true } },
} satisfies Prisma.EvaluationFolioInclude;

/** Folio con paciente y evaluador, tal como lo devuelve la API. */
export type EvaluationFolioWithRelations = Prisma.EvaluationFolioGetPayload<{
  include: typeof evaluationFolioInclude;
}>;
