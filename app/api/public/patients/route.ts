import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { publicPatientCreateSchema } from "@/lib/validators";
import { notifyRole, NotificationType } from "@/lib/notifications";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { findIntakeMatch } from "@/lib/patient-match";

/**
 * POST /api/public/patients — public intake form. No authentication.
 * Anyone can submit; coordination is notified to review and assign.
 */
export async function POST(req: NextRequest) {
  // Limita el spam/abuso: 5 envíos por IP cada 10 minutos.
  const limit = rateLimit(`intake:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = publicPatientCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Si el nombre + otro dato (CURP/fecha de nacimiento/teléfono) coincide con
  // un expediente existente, no se crea un Patient duplicado: se deja en
  // espera de que Coordinación decida (actualizar/reactivar o crear nuevo).
  const match = await findIntakeMatch(data);

  const resultId = await db.$transaction(async (tx) => {
    if (match) {
      const intakeMatch = await tx.patientIntakeMatch.create({
        data: {
          // Json no admite Date; se guarda como ISO string. publicPatientCreateSchema
          // usa z.coerce.date(), así que re-parsear con ese mismo schema al leerlo
          // reconstruye el Date sin lógica aparte.
          submittedData: { ...data, dateOfBirth: data.dateOfBirth.toISOString() },
          matchedPatientId: match.patient.id,
          matchedByField: match.matchedByField,
        },
      });

      await notifyRole(
        Role.COORDINATOR,
        {
          type: NotificationType.PATIENT_MATCH_REVIEW,
          title: "Posible expediente existente",
          message: `${data.fullName} envió el formulario y coincide con un expediente existente. Requiere revisión.`,
          relatedEntityId: intakeMatch.id,
        },
        tx,
      );

      return intakeMatch.id;
    }

    const created = await tx.patient.create({
      data: {
        fullName: data.fullName,
        age: data.age,
        dateOfBirth: data.dateOfBirth ?? null,
        curp: data.curp || null,
        phoneNumber: data.phoneNumber,
        address: data.address || null,
        postalCode: data.postalCode || null,
        email: data.email || null,
        serviceArea: data.serviceArea,
        referenceType: data.referenceType,
        consultationReason: data.consultationReason,
        preferredTimeSlot: data.preferredTimeSlot,
      },
    });

    await notifyRole(
      Role.COORDINATOR,
      {
        type: NotificationType.NEW_FORM_SUBMITTED,
        title: "Nueva solicitud de cita",
        message: `${created.fullName} envió el formulario y requiere revisión.`,
        relatedEntityId: created.id,
      },
      tx,
    );

    return created.id;
  });

  // Only confirm receipt — don't leak internal data publicly (whether it
  // matched an existing record or not).
  return Response.json({ ok: true, id: resultId }, { status: 201 });
}
