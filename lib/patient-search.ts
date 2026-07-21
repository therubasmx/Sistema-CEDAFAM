import { normalizeName } from "@/lib/patient-match";

// True if a and b can be turned into each other with at most one character
// insertion, deletion, or substitution. Bounded edit distance, not full
// Levenshtein, since we only ever need to tolerate a single typo.
function isWithinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) {
      i++;
    } else {
      j++;
    }
  }
  edits += a.length - i + (b.length - j);
  return edits <= 1;
}

// Substring search tolerant to a single differing character anywhere in the
// match, e.g. "jose", "jsoe" and "josw" all find "jose" inside "jose perez".
function fuzzyContains(haystack: string, needle: string): boolean {
  if (!needle) return true;
  if (haystack.includes(needle)) return true;

  for (let start = 0; start < haystack.length; start++) {
    for (const len of [needle.length - 1, needle.length, needle.length + 1]) {
      if (len <= 0 || start + len > haystack.length) continue;
      if (isWithinOneEdit(haystack.slice(start, start + len), needle)) return true;
    }
  }
  return false;
}

export interface SearchablePatient {
  fullName: string;
  phoneNumber: string;
  fileNumber: string | null;
  cedafamFolio: string | null;
}

/**
 * Predicado de búsqueda para la tabla de Pacientes: el nombre ignora acentos,
 * mayúsculas y una letra distinta; teléfono, expediente hospital y folio
 * CEDAFAM hacen match por substring simple (insensible a mayúsculas/acentos).
 */
export function patientMatchesSearch(patient: SearchablePatient, rawQuery: string): boolean {
  const query = normalizeName(rawQuery);
  if (!query) return true;

  if (fuzzyContains(normalizeName(patient.fullName), query)) return true;
  if (patient.phoneNumber.includes(rawQuery.trim())) return true;
  if (patient.fileNumber && normalizeName(patient.fileNumber).includes(query)) return true;
  if (patient.cedafamFolio && normalizeName(patient.cedafamFolio).includes(query)) return true;

  return false;
}
