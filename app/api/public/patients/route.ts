import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { patientCreateSchema } from "@/lib/validators";
import { notifyRole, NotificationType } from "@/lib/notifications";

/**
 * POST /api/public/patients — public intake form. No authentication.
 * Anyone can submit; coordination is notified to review and assign.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patientCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const patient = await db.$transaction(async (tx) => {
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

    return created;
  });

  // Only confirm receipt — don't leak internal data publicly.
  return Response.json({ ok: true, id: patient.id }, { status: 201 });
}
