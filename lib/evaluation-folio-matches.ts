import { normalizeFileNumber } from "@/lib/patient-duplicates";

export interface OrphanFolioForMatch {
  id: string;
  fileNumber: string | null;
}

export interface PatientForMatch {
  id: string;
  fullName: string;
  fileNumber: string | null;
}

export interface FolioMatchCandidate {
  evaluationFolioId: string;
  candidatePatientId: string;
  candidatePatientName: string;
  matchedByField: "fileNumber";
}

/**
 * Candidatos para ligar un folio de evaluación sin paciente (registro en
 * papel) con un expediente ya existente: mismo número de expediente de
 * hospital. A diferencia de findDuplicateCandidates, aquí no se exige
 * también nombre similar — el expediente de hospital ya es identificador
 * suficiente para sugerir, y quien revisa decide con el nombre a la vista.
 * Si el expediente cae en más de un paciente, no es confiable y se omite.
 */
export function findEvaluationFolioMatches(
  folios: OrphanFolioForMatch[],
  patients: PatientForMatch[],
): FolioMatchCandidate[] {
  const byFile = new Map<string, PatientForMatch[]>();
  for (const patient of patients) {
    if (!patient.fileNumber) continue;
    const key = normalizeFileNumber(patient.fileNumber);
    const group = byFile.get(key);
    if (group) group.push(patient);
    else byFile.set(key, [patient]);
  }

  const results: FolioMatchCandidate[] = [];
  for (const folio of folios) {
    if (!folio.fileNumber) continue;
    const hits = byFile.get(normalizeFileNumber(folio.fileNumber));
    if (!hits || hits.length !== 1) continue;
    results.push({
      evaluationFolioId: folio.id,
      candidatePatientId: hits[0].id,
      candidatePatientName: hits[0].fullName,
      matchedByField: "fileNumber",
    });
  }
  return results;
}
