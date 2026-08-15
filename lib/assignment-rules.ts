import {
  ConsultationCategory,
  ReferenceType,
  Speciality,
  WorkType,
} from "@prisma/client";
import { specialityLabels, workTypeLabels } from "@/lib/labels";

/**
 * Reglas de canalización: qué perfil de psicólogo corresponde a un paciente
 * según la categoría de su motivo de consulta, su edad y su tipo de referencia.
 *
 * Son la base de las sugerencias en el módulo de Asignaciones — advisory, no
 * obligatorias: quien asigna siempre puede elegir a otra persona a mano.
 */

/** Convenio UM / Hospital: varias reglas cambian de perfil cuando aplica. */
export const UM_REFERENCE_TYPES: ReferenceType[] = [
  ReferenceType.UM_STUDENT,
  ReferenceType.UM_EMPLOYEE,
  ReferenceType.HOSPITAL_EMPLOYEE,
];

export function isUmReferred(referenceType: ReferenceType): boolean {
  return UM_REFERENCE_TYPES.includes(referenceType);
}

/** Especialidades que dan terapia (las que atienden un motivo "general"). */
const THERAPY_SPECIALITIES: Speciality[] = [
  Speciality.CLINICAL,
  Speciality.EDUCATIONAL,
  Speciality.FAMILY_THERAPY,
];

export interface AssignmentRule {
  /** Identificador estable de la regla (para pruebas y depuración). */
  id: string;
  /** Especialidades que la regla recomienda. */
  specialities: Speciality[];
  /** Tipo de contratación exigido, cuando la regla lo especifica (p. ej. Pasante). */
  workType?: WorkType;
  /**
   * true cuando la regla no pide un perfil concreto sino "quien tenga cupo":
   * la carga de pacientes activos pesa más que la especialidad al ordenar.
   */
  byCapacity?: boolean;
  /** Texto que se muestra en el diálogo para explicar la sugerencia. */
  description: string;
}

interface RuleInput {
  category: ConsultationCategory;
  age: number;
  referenceType: ReferenceType;
}

/**
 * Resuelve la regla aplicable. Devuelve siempre una regla: las siete
 * categorías están cubiertas.
 */
export function resolveAssignmentRule({
  category,
  age,
  referenceType,
}: RuleInput): AssignmentRule {
  const um = isUmReferred(referenceType);

  switch (category) {
    case ConsultationCategory.EMOTIONAL_DISTRESS:
      if (um) {
        return {
          id: "emotional_um",
          specialities: [Speciality.FAMILY_THERAPY],
          description:
            "Malestar emocional con convenio UM/Hospital → Terapia Familiar.",
        };
      }
      // Menores de 18 sin convenio: los atiende Psicología Clínica Pasante.
      if (age < 18) {
        return {
          id: "emotional_minor",
          specialities: [Speciality.CLINICAL],
          workType: WorkType.INTERN,
          description:
            "Malestar emocional, menor de 18 sin convenio → Psicología Clínica (Pasante).",
        };
      }
      // Mayores de edad sin convenio: no hay perfil obligado, manda el cupo.
      return {
        id: "emotional_adult",
        specialities: THERAPY_SPECIALITIES,
        byCapacity: true,
        description:
          "Malestar emocional, mayor de 18 sin convenio → quien tenga más cupo de pacientes activos.",
      };

    case ConsultationCategory.COUPLES_THERAPY:
      return {
        id: "couples",
        specialities: [Speciality.FAMILY_THERAPY],
        description: "Terapia de pareja → Terapia Familiar (sin importar edad ni convenio).",
      };

    case ConsultationCategory.FAMILY_PROBLEMS:
      return {
        id: "family",
        specialities: [Speciality.FAMILY_THERAPY],
        description:
          "Problemas familiares → Terapia Familiar (sin importar edad ni convenio).",
      };

    case ConsultationCategory.ACADEMIC_PROBLEMS:
      return um
        ? {
            id: "academic_um",
            specialities: [Speciality.FAMILY_THERAPY],
            description:
              "Problemas académicos con convenio UM/Hospital → Terapia Familiar (sin importar edad).",
          }
        : {
            id: "academic_general",
            specialities: [Speciality.EDUCATIONAL],
            description: "Problemas académicos sin convenio → Psicología Educativa.",
          };

    case ConsultationCategory.NEUROPSYCHOLOGICAL_EVALUATION:
      return {
        id: "neuro_evaluation",
        specialities: [Speciality.NEUROPSYCHOLOGY],
        description: "Evaluación neuropsicológica → Neuropsicología.",
      };

    case ConsultationCategory.PSYCHOLOGICAL_EVALUATION:
      return um
        ? {
            id: "psych_evaluation_um",
            specialities: [Speciality.FAMILY_THERAPY],
            description:
              "Evaluación psicológica con convenio UM/Hospital → Terapia Familiar (sin importar edad).",
          }
        : {
            id: "psych_evaluation_general",
            specialities: [Speciality.EDUCATIONAL, Speciality.CLINICAL],
            description:
              "Evaluación psicológica sin convenio → Psicología Educativa o Clínica (sin importar edad).",
          };

    case ConsultationCategory.PSYCHIATRY:
      return {
        id: "psychiatry",
        specialities: [Speciality.PSYCHIATRY],
        description: "Psiquiatría → Psiquiatría.",
      };
  }
}

/** Perfil recomendado en corto, p. ej. "Psicología Clínica · Pasante". */
export function ruleProfileLabel(rule: AssignmentRule): string {
  const specialities = rule.specialities.map((s) => specialityLabels[s]).join(" o ");
  return rule.workType
    ? `${specialities} · ${workTypeLabels[rule.workType]}`
    : specialities;
}

/**
 * Qué tanto encaja un psicólogo con la regla, de 0 a 1.
 *   1    → cumple especialidad y, si aplica, tipo de contratación
 *   0.6  → la especialidad es correcta pero no es del tipo que pide la regla
 *   0    → no encaja
 */
export function ruleFitScore(
  rule: AssignmentRule,
  psychologist: { speciality: Speciality; workType: WorkType },
): number {
  if (!rule.specialities.includes(psychologist.speciality)) return 0;
  if (rule.workType && psychologist.workType !== rule.workType) return 0.6;
  return 1;
}
