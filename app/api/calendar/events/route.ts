import { type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { calendarEventCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

/**
 * GET /api/calendar/events?from=ISO&to=ISO
 * Lista los eventos internos que se solapan con el rango. Visible para todos
 * los roles autenticados.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const where: Prisma.CalendarEventWhereInput = {};
  if (fromParam) where.endAt = { gt: new Date(fromParam) };
  if (toParam) where.startAt = { lt: new Date(toParam) };

  const events = await db.calendarEvent.findMany({
    where,
    orderBy: { startAt: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  return Response.json(events);
}

/**
 * POST /api/calendar/events — crea un evento interno (jefatura/coordinación).
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("events:manage");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = calendarEventCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Etiqueta el evento con la coordinación del creador (snapshot).
  const creator = await db.user.findUnique({
    where: { id: user.id },
    select: { coordination: true },
  });

  const event = await db.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: {
        title: data.title,
        startAt: data.startAt,
        endAt: data.endAt,
        coordination: creator?.coordination ?? null,
        createdById: user.id,
      },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "CalendarEvent",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: {
          title: data.title,
          startAt: data.startAt.toISOString(),
          endAt: data.endAt.toISOString(),
        },
      },
      tx,
    );
    return created;
  });

  return Response.json(event, { status: 201 });
}
