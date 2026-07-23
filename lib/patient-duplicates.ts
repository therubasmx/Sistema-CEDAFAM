import { normalizeName, normalizePhoneDigits } from "@/lib/patient-match";

// Grupos de teléfono con demasiados expedientes casi nunca son la misma
// persona: suelen ser un número de recepción/conmutador compartido o un
// teléfono de un familiar capturado para varios pacientes.
const MAX_PHONE_GROUP_SIZE = 6;

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
}

export interface DuplicateCandidatePair {
  patientAId: string;
  patientBId: string;
  matchedByField: "phoneNumber";
}

/**
 * Candidatos a duplicado entre pacientes ya existentes: mismo teléfono Y
 * nombre similar. Se exigen ambas señales a la vez (igual que
 * findIntakeMatch, que pide nombre + al menos otro campo) para no inundar la
 * cola con falsos positivos — mismo teléfono solo no basta, porque varios
 * pacientes de una misma familia suelen compartir el número de quien agenda.
 */
export function findDuplicateCandidates(
  patients: DuplicateScanPatient[],
): DuplicateCandidatePair[] {
  const byPhone = new Map<string, DuplicateScanPatient[]>();
  for (const patient of patients) {
    const phone = normalizePhoneDigits(patient.phoneNumber);
    if (!phone) continue;
    const group = byPhone.get(phone);
    if (group) group.push(patient);
    else byPhone.set(phone, [patient]);
  }

  const pairs: DuplicateCandidatePair[] = [];
  for (const group of byPhone.values()) {
    if (group.length < 2 || group.length > MAX_PHONE_GROUP_SIZE) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (namesAreSimilar(group[i].fullName, group[j].fullName)) {
          pairs.push({
            patientAId: group[i].id,
            patientBId: group[j].id,
            matchedByField: "phoneNumber",
          });
        }
      }
    }
  }
  return pairs;
}
