import { type NextRequest } from "next/server";
import { EventKind, EventScope, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { canManageEventKind } from "@/lib/permissions";
import { calendarEventUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/calendar/events/[id] — edita un evento interno ya creado.
 *
 * Mismo permiso que crear/borrar: jefatura/coordinación, o el titular del
 * puesto dueño de ese tipo de evento (`canManageEventKind`). No se puede
 * editar `kind` ni `scope` — son fijos desde la creación (ver el comentario
 * en `calendarEventUpdateSchema`) — ni un bloqueo `LEAVE`, que se retira
 * rechazando el permiso, no editando el evento.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  if (existing.kind === EventKind.LEAVE) {
    return Response.json(
      {
        error:
          "Este bloqueo viene de un permiso aprobado. Ajústalo desde Coordinación Desarrollo Profesional.",
      },
      { status: 409 },
    );
  }

  if (!canManageEventKind(user, existing.kind)) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = calendarEventUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // El alcance no cambia con la edición, así que la regla de invitados sigue
  // aplicando: SELECTED necesita al menos uno.
  const attendeeIds =
    existing.scope === EventScope.SELECTED ? [...new Set(data.attendeeIds)] : [];
  if (existing.scope === EventScope.SELECTED && attendeeIds.length === 0) {
    return Response.json(
      { error: "Selecciona al menos un psicólogo" },
      { status: 400 },
    );
  }
  if (attendeeIds.length > 0) {
    const activeCount = await db.psychologist.count({
      where: { id: { in: attendeeIds }, isActive: true },
    });
    if (activeCount !== attendeeIds.length) {
      return Response.json(
        { error: "Alguno de los psicólogos invitados no está disponible" },
        { status: 400 },
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.calendarEvent.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description || null,
        location: data.location || null,
        startAt: data.startAt,
        endAt: data.endAt,
        beneficiaryCount: data.beneficiaryCount ?? null,
        womenCount: data.womenCount ?? null,
        menCount: data.menCount ?? null,
        // Prisma exige el centinela DbNull para limpiar una columna Json —
        // pasar `null` a secas guardaría el literal JSON `null`, no un NULL de SQL.
        ageRanges:
          data.ageRanges === undefined
            ? Prisma.DbNull
            : data.ageRanges === null
              ? Prisma.DbNull
              : data.ageRanges,
        ...(existing.scope === EventScope.SELECTED && {
          attendees: {
            deleteMany: {},
            create: attendeeIds.map((psychologistId) => ({ psychologistId })),
          },
        }),
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "CalendarEvent",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: {
          title: data.title,
          startAt: data.startAt.toISOString(),
          endAt: data.endAt.toISOString(),
        },
      },
      tx,
    );

    return result;
  });

  return Response.json(updated);
}

/**
 * DELETE /api/calendar/events/[id] — elimina un evento interno.
 *
 * Lo puede borrar jefatura/coordinación, o el titular del puesto que administra
 * ese tipo de evento. Los bloqueos de permiso (LEAVE) no se borran aquí: se
 * retiran rechazando la solicitud, para que el permiso y su bloqueo no queden
 * desincronizados.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  const existing = await db.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Evento no encontrado" }, { status: 404 });
  }

  if (existing.kind === EventKind.LEAVE) {
    return Response.json(
      {
        error:
          "Este bloqueo viene de un permiso aprobado. Recházalo desde Coordinación Desarrollo Profesional para liberarlo.",
      },
      { status: 409 },
    );
  }

  if (!canManageEventKind(user, existing.kind)) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  await db.$transaction(async (tx) => {
    await tx.calendarEvent.delete({ where: { id } });
    await recordAudit(
      {
        userId: user.id,
        entityType: "CalendarEvent",
        entityId: id,
        action: AuditAction.DELETE,
      },
      tx,
    );
  });

  return Response.json({ ok: true });
}
