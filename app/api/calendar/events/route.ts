import { type NextRequest } from "next/server";
import { EventKind, EventScope, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { canManageEventKind } from "@/lib/permissions";
import { calendarEventCreateSchema } from "@/lib/validators";
import { NotificationType, notifyRole } from "@/lib/notifications";
import { positionLabels } from "@/lib/labels";
import { recordAudit, AuditAction } from "@/lib/audit";

/**
 * GET /api/calendar/events?from=ISO&to=ISO
 * Lista los eventos internos que se solapan con el rango.
 *
 * Jefatura, coordinación y contabilidad ven todos los eventos porque
 * administran la agenda completa. Un psicólogo solo ve los que le competen:
 * los de alcance global y aquellos a los que fue invitado — así el permiso
 * aprobado de un compañero no aparece en su calendario.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const kindParam = searchParams.get("kind");

  const where: Prisma.CalendarEventWhereInput = {};
  if (fromParam) where.endAt = { gt: new Date(fromParam) };
  if (toParam) where.startAt = { lt: new Date(toParam) };
  // Los módulos de coordinación piden solo su tipo, para su historial.
  if (kindParam && kindParam in EventKind) where.kind = kindParam as EventKind;

  if (user.role === Role.PSYCHOLOGIST) {
    if (!user.psychologistId) return Response.json([]);
    where.OR = [
      { scope: EventScope.ALL },
      {
        scope: EventScope.SELECTED,
        attendees: { some: { psychologistId: user.psychologistId } },
      },
    ];
  } else {
    // El evento informativo de un permiso aprobado (blocksAgenda: false) es
    // solo para la agenda personal de quien lo revisó; en la vista global ya
    // se ve el bloqueo real ("Permiso — nombre"), así que mostrar los dos
    // duplica la tarjeta para Jefatura, Coordinación y Contabilidad.
    where.NOT = { kind: EventKind.LEAVE, blocksAgenda: false };
  }

  const events = await db.calendarEvent.findMany({
    where,
    orderBy: { startAt: "asc" },
    include: {
      createdBy: { select: { name: true } },
      attendees: {
        select: {
          psychologistId: true,
          psychologist: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  return Response.json(events);
}

/**
 * POST /api/calendar/events — crea un evento interno.
 *
 * Lo usan tanto jefatura/coordinación (evento general) como los módulos de
 * Extensión a la Comunidad, Capital Humano y Cumpleaños. El alcance del evento
 * define a quién se le notifica y a quién se le bloquea la agenda.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
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

  // El permiso depende del tipo de evento: cada puesto administra el suyo.
  if (!canManageEventKind(user, data.kind)) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  // Los invitados deben existir y estar activos; si no, el evento bloquearía
  // agendas fantasma. Con kind = CASE_STUDY, attendeeIds trae al único
  // presentador, aunque el alcance sea ALL: no es a quién se invita, es de
  // quién se etiqueta el evento.
  const attendeeIds =
    data.scope === EventScope.SELECTED || data.kind === EventKind.CASE_STUDY
      ? [...new Set(data.attendeeIds)]
      : [];
  let attendeePsychologists: { id: string; userId: string; name: string }[] = [];
  if (attendeeIds.length > 0) {
    const rows = await db.psychologist.findMany({
      where: { id: { in: attendeeIds }, isActive: true },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    attendeePsychologists = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.name,
    }));
    if (attendeePsychologists.length !== attendeeIds.length) {
      return Response.json(
        { error: "Alguno de los psicólogos invitados no está disponible" },
        { status: 400 },
      );
    }
  }

  // Etiqueta el evento con el puesto del creador (snapshot). Se guarda el
  // texto y no el enum para que el evento conserve su etiqueta aunque después
  // esa persona cambie de puesto.
  const creator = await db.user.findUnique({
    where: { id: user.id },
    select: { position: true },
  });
  const coordinationLabel = creator?.position
    ? positionLabels[creator.position]
    : null;

  // Un festejo de cumpleaños es informativo: se ve en el calendario de todos
  // pero no tiene por qué cerrarle la agenda a nadie.
  const blocksAgenda = data.kind !== EventKind.BIRTHDAY_PARTY;

  // El Estudio de Caso no pide título: se etiqueta solo con quien lo presenta.
  const title =
    data.kind === EventKind.CASE_STUDY
      ? `Estudio de Caso — ${attendeePsychologists[0].name}`
      : data.title;

  const when = data.startAt.toLocaleString("es-MX", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });

  const event = await db.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: {
        title,
        description: data.description || null,
        location: data.location || null,
        startAt: data.startAt,
        endAt: data.endAt,
        coordination: coordinationLabel,
        kind: data.kind,
        scope: data.scope,
        blocksAgenda,
        createdById: user.id,
        ...(attendeeIds.length > 0 && {
          attendees: {
            create: attendeeIds.map((psychologistId) => ({ psychologistId })),
          },
        }),
      },
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "CalendarEvent",
        entityId: created.id,
        action: AuditAction.CREATE,
        changedFields: {
          title,
          kind: data.kind,
          scope: data.scope,
          startAt: data.startAt.toISOString(),
          endAt: data.endAt.toISOString(),
        },
      },
      tx,
    );

    // Aviso: a todos si el evento es global, o solo a los invitados.
    const message = `${title} — ${when}${data.location ? ` · ${data.location}` : ""}.`;
    if (data.scope === EventScope.ALL) {
      await notifyRole(
        Role.PSYCHOLOGIST,
        {
          type: NotificationType.EVENT_INVITATION,
          title: "Nuevo evento",
          message,
          relatedEntityId: created.id,
        },
        tx,
      );
    } else if (data.scope === EventScope.SELECTED && attendeePsychologists.length > 0) {
      await tx.notification.createMany({
        data: attendeePsychologists.map((p) => ({
          userId: p.userId,
          type: NotificationType.EVENT_INVITATION,
          title: "Te invitaron a un evento",
          message,
          relatedEntityId: created.id,
        })),
      });
    }

    return created;
  });

  return Response.json(event, { status: 201 });
}
