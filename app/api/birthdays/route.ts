import { type NextRequest } from "next/server";
import { Position } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requirePosition } from "@/lib/api-auth";
import { recordAudit, AuditAction } from "@/lib/audit";

const BIRTHDAY_COORDINATION = Position.BIRTHDAYS;

const birthdaySetSchema = z.object({
  userId: z.string().uuid(),
  // `null` borra la fecha registrada.
  birthDate: z.coerce.date().nullable(),
});

/**
 * GET /api/birthdays — usuarios activos con su fecha de cumpleaños.
 *
 * Visible para cualquiera con sesión: el calendario de todos muestra los
 * cumpleaños. El módulo de Cumpleaños usa la misma lista para saber a quién
 * le falta fecha.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;

  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, birthDate: true },
  });

  return Response.json(users);
}

/**
 * PUT /api/birthdays — registra o borra el cumpleaños de una persona.
 * Solo la coordinación de Cumpleaños (y jefatura) lo captura.
 */
export async function PUT(req: NextRequest) {
  const guard = await requirePosition(BIRTHDAY_COORDINATION);
  if (guard instanceof Response) return guard;
  const actor = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = birthdaySetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { userId, birthDate } = parsed.data;

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: userId },
      data: { birthDate },
      select: { id: true, name: true, birthDate: true },
    });
    await recordAudit(
      {
        userId: actor.id,
        entityType: "User",
        entityId: userId,
        action: AuditAction.UPDATE,
        changedFields: { birthDate: birthDate?.toISOString() ?? null },
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}
