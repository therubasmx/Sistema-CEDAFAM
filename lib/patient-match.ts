import { db } from "@/lib/db";
import { activityInclude, getLastActivityAt, type PatientWithActivity } from "@/lib/patient-status";
import type { PublicPatientCreateInput } from "@/lib/validators";

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // quita acentos tras la descomposición NFD
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCurp(curp: string): string {
  return curp.toUpperCase().replace(/\s/g, "");
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

type MatchedByField = "curp" | "dateOfBirth" | "phoneNumber";

const FIELD_PRIORITY: MatchedByField[] = ["curp", "dateOfBirth", "phoneNumber"];

export interface IntakeMatchCandidate {
  patient: PatientWithActivity;
  matchedByField: MatchedByField;
}

/**
 * Busca un expediente existente que coincida con una solicitud entrante del
 * formulario público: mismo nombre normalizado Y al menos uno de
 * CURP/fecha de nacimiento/teléfono. Con varios candidatos, prioriza
 * curp > dateOfBirth > phoneNumber y desempata por actividad más reciente.
 */
export async function findIntakeMatch(
  data: PublicPatientCreateInput,
): Promise<IntakeMatchCandidate | null> {
  const normalizedInputName = normalizeName(data.fullName);
  const normalizedCurp = normalizeCurp(data.curp);
  const normalizedPhone = normalizePhoneDigits(data.phoneNumber);

  const candidates = await db.patient.findMany({
    where: {
      OR: [
        { curp: normalizedCurp },
        { dateOfBirth: data.dateOfBirth },
        { phoneNumber: { contains: normalizedPhone } },
      ],
    },
    include: activityInclude,
  });

  const matches: IntakeMatchCandidate[] = [];
  for (const patient of candidates) {
    if (normalizeName(patient.fullName) !== normalizedInputName) continue;

    const matchedByField = FIELD_PRIORITY.find((field) => {
      if (field === "curp") return !!patient.curp && normalizeCurp(patient.curp) === normalizedCurp;
      if (field === "dateOfBirth") {
        return !!patient.dateOfBirth && patient.dateOfBirth.getTime() === data.dateOfBirth.getTime();
      }
      return normalizePhoneDigits(patient.phoneNumber) === normalizedPhone;
    });
    if (matchedByField) matches.push({ patient, matchedByField });
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const priorityDiff =
      FIELD_PRIORITY.indexOf(a.matchedByField) - FIELD_PRIORITY.indexOf(b.matchedByField);
    if (priorityDiff !== 0) return priorityDiff;
    return getLastActivityAt(b.patient).getTime() - getLastActivityAt(a.patient).getTime();
  });

  return matches[0];
}
