import { type NextRequest } from "next/server";
import { ConsultationCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { serviceAreaToSpeciality } from "@/lib/labels";
import {
  resolveAssignmentRule,
  ruleFitScore,
  ruleProfileLabel,
  type AssignmentRule,
} from "@/lib/assignment-rules";

/**
 * GET /api/assignments/suggestions?patientId=X[&category=Y]
 * Returns the patient's consultation context plus the top 3 psychologist
 * suggestions, scored by:
 *   - fit with the canalization rule for the patient's consultation category,
 *     age and reference type (see lib/assignment-rules.ts) — strong weight
 *   - current active-patient load (lighter load ranks higher)
 *   - configured availability for the patient's preferred time slot
 *
 * `category` overrides the one stored on the patient so the dialog can preview
 * suggestions while Coordination is still picking it from the dropdown.
 * Without a category (stored or passed) it falls back to matching the
 * serviceArea against the speciality, as before.
 *
 * Coordination makes the final choice — this is advisory only.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("assignments:suggest");
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (!patientId) {
    return Response.json({ error: "patientId es requerido" }, { status: 400 });
  }

  const categoryParam = searchParams.get("category");
  if (
    categoryParam &&
    !Object.values(ConsultationCategory).includes(categoryParam as ConsultationCategory)
  ) {
    return Response.json({ error: "Categoría inválida" }, { status: 400 });
  }

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  const category =
    (categoryParam as ConsultationCategory | null) ?? patient.consultationCategory;

  const rule: AssignmentRule | null = category
    ? resolveAssignmentRule({
        category,
        age: patient.age,
        referenceType: patient.referenceType,
      })
    : null;

  // Sin categoría capturada seguimos con el criterio anterior (área de servicio).
  const fallbackSpecialities = serviceAreaToSpeciality[patient.serviceArea];

  // El diálogo muestra el motivo tal cual lo escribió el paciente para que
  // quien asigna lo lea antes de clasificarlo; `consultationCategory` es la
  // que está guardada, no el preview que llegó por query.
  const context = {
    consultationReason: patient.consultationReason,
    consultationCategory: patient.consultationCategory,
    age: patient.age,
    referenceType: patient.referenceType,
  };

  const psychologists = await db.psychologist.findMany({
    where: { isActive: true, endDate: null },
    include: {
      user: { select: { name: true } },
      availability: { where: { isActive: true } },
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
  });

  if (psychologists.length === 0) {
    return Response.json({ patient: context, rule: ruleSummary(rule), suggestions: [] });
  }

  const maxLoad = Math.max(1, ...psychologists.map((p) => p._count.assignments));

  // Cuando la regla es "quien tenga cupo", la carga pesa más que el perfil.
  const fitWeight = rule?.byCapacity ? 0.25 : 0.55;
  const loadWeight = rule?.byCapacity ? 0.65 : 0.35;

  const scored = psychologists.map((p) => {
    const fit = rule
      ? ruleFitScore(rule, p)
      : fallbackSpecialities.includes(p.speciality)
        ? 1
        : 0;
    // Preferred slot maps to a rough hour range; we only check a slot is set up.
    const hasAvailability = p.availability.length > 0;

    const loadScore = 1 - p._count.assignments / maxLoad; // 0..1, less load = higher
    const availabilityScore = hasAvailability ? 1 : 0;

    const score = fit * fitWeight + loadScore * loadWeight + availabilityScore * 0.1;

    return {
      psychologistId: p.id,
      name: p.user.name,
      speciality: p.speciality,
      workType: p.workType,
      activePatientCount: p._count.assignments,
      // Cumple la especialidad que pide la regla (o el área, sin categoría).
      specialityMatch: fit > 0,
      // Cumple además el tipo de contratación que la regla exige (Pasante).
      profileMatch: fit === 1,
      hasAvailability,
      score: Number(score.toFixed(3)),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return Response.json({
    patient: context,
    rule: ruleSummary(rule),
    suggestions: scored.slice(0, 3),
  });
}

function ruleSummary(rule: AssignmentRule | null) {
  if (!rule) return null;
  return {
    id: rule.id,
    description: rule.description,
    profile: ruleProfileLabel(rule),
    byCapacity: rule.byCapacity ?? false,
  };
}
