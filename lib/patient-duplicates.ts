import { normalizeName, normalizePhoneDigits } from "@/lib/patient-match";

// Grupos con demasiados expedientes casi nunca son la misma persona: suelen
// ser un número de recepción/conmutador compartido, un teléfono de familiar
// capturado para varios pacientes, o un expediente/placeholder repetido.
const MAX_GROUP_SIZE = 6;

export function normalizeFileNumber(value: string): string {
  return value.trim().toUpperCase();
}

// Tolerancia de edición sobre el nombre ya normalizado (sin acentos,
// minúsculas). Cubre erratas de captura más allá de lo que normalizeName
// resuelve por sí solo (ej. "Ma. del Carmen" vs "Maria del Carmen" no
// entraría aquí, pero "Gonzalez" vs "Gonzales" sí).
const MAX_NAME_EDIT_DISTANCE = 3;

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

/**
 * Dos nombres cuentan como "el mismo" si, ya normalizados, son idénticos, si
 * traen las mismas palabras en otro orden (apellido/nombre invertido es un
 * error de captura común en los históricos), o si están a pocas erratas de
 * distancia.
 */
export function namesAreSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const tokensA = na.split(" ").filter(Boolean).sort();
  const tokensB = nb.split(" ").filter(Boolean).sort();
  if (tokensA.length > 1 && tokensA.length === tokensB.length && tokensA.join(" ") === tokensB.join(" ")) {
    return true;
  }

  if (Math.abs(na.length - nb.length) > MAX_NAME_EDIT_DISTANCE) return false;
  return levenshtein(na, nb) <= MAX_NAME_EDIT_DISTANCE;
}

export interface DuplicateScanPatient {
  id: string;
  fullName: string;
  phoneNumber: string;
  fileNumber: string | null;
}

export type DuplicateMatchedByField = "phoneNumber" | "fileNumber";

export interface DuplicateCandidatePair {
  patientAId: string;
  patientBId: string;
  matchedByField: DuplicateMatchedByField;
}

function findPairsByKey(
  patients: DuplicateScanPatient[],
  keyOf: (p: DuplicateScanPatient) => string | null,
  matchedByField: DuplicateMatchedByField,
  seenPairs: Set<string>,
  pairs: DuplicateCandidatePair[],
): void {
  const groups = new Map<string, DuplicateScanPatient[]>();
  for (const patient of patients) {
    const key = keyOf(patient);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(patient);
    else groups.set(key, [patient]);
  }

  for (const group of groups.values()) {
    if (group.length < 2 || group.length > MAX_GROUP_SIZE) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!namesAreSimilar(group[i].fullName, group[j].fullName)) continue;
        const pairKey = [group[i].id, group[j].id].sort().join("|");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        pairs.push({ patientAId: group[i].id, patientBId: group[j].id, matchedByField });
      }
    }
  }
}

/**
 * Candidatos a duplicado entre pacientes ya existentes: mismo teléfono O
 * mismo número de expediente de hospital, siempre Y nombre similar. Se exige
 * nombre en ambos casos (igual que findIntakeMatch, que pide nombre + al
 * menos otro campo) para no inundar la cola con falsos positivos — comparten
 * teléfono no basta por sí solo, porque varios pacientes de una misma familia
 * suelen compartir el número de quien agenda; comparten expediente no basta
 * por sí solo porque un número mal capturado (placeholder, "0", etc.) puede
 * repetirse entre personas distintas.
 */
export function findDuplicateCandidates(
  patients: DuplicateScanPatient[],
): DuplicateCandidatePair[] {
  const pairs: DuplicateCandidatePair[] = [];
  const seenPairs = new Set<string>();

  findPairsByKey(
    patients,
    (p) => normalizePhoneDigits(p.phoneNumber) || null,
    "phoneNumber",
    seenPairs,
    pairs,
  );
  findPairsByKey(
    patients,
    (p) => (p.fileNumber ? normalizeFileNumber(p.fileNumber) : null),
    "fileNumber",
    seenPairs,
    pairs,
  );

  return pairs;
}
