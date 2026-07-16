/**
 * Sections that can be included in a report export. The export dialog offers
 * these grouped as "Pacientes" and "Psicólogos"; the export API receives the
 * selected keys via the `sections` query param (comma-separated).
 */
export const PATIENT_SECTIONS = [
  "patients_new",
  "patients_status",
  "patients_type",
  "patients_reasons",
  "patients_indicators",
] as const;

export const PSYCH_SECTIONS = [
  "psych_patients",
  "psych_sessions",
  "psych_hours",
] as const;

export type ReportSection =
  | (typeof PATIENT_SECTIONS)[number]
  | (typeof PSYCH_SECTIONS)[number];

export const ALL_SECTIONS: readonly ReportSection[] = [
  ...PATIENT_SECTIONS,
  ...PSYCH_SECTIONS,
];

export const SECTION_LABELS: Record<ReportSection, string> = {
  patients_new: "Pacientes nuevos por período",
  patients_status: "Pacientes por estado (terapia y evaluaciones)",
  patients_type: "Pacientes por tipo",
  patients_reasons: "Motivos de consulta frecuentes",
  patients_indicators: "Indicadores (deserción y duración promedio)",
  psych_patients: "Psicólogos y pacientes asignados",
  psych_sessions: "Citas por psicólogo en el rango",
  psych_hours: "Horas de atención reportadas",
};

/** Parses the `sections` query param; missing/empty → all sections. */
export function parseSections(param: string | null): Set<ReportSection> {
  if (!param) return new Set(ALL_SECTIONS);
  const valid = new Set<string>(ALL_SECTIONS);
  const picked = param
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ReportSection => valid.has(s));
  return picked.length > 0 ? new Set(picked) : new Set(ALL_SECTIONS);
}

export function hasPatientSection(sections: Set<ReportSection>): boolean {
  return PATIENT_SECTIONS.some((s) => sections.has(s));
}

export function hasPsychSection(sections: Set<ReportSection>): boolean {
  return PSYCH_SECTIONS.some((s) => sections.has(s));
}
