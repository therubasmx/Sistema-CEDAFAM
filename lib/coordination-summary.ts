import { EventKind, LeaveStatus, LeaveUnit, Position } from "@prisma/client";
import { db } from "@/lib/db";
import { buildSurveyReport } from "@/lib/survey-report";
import { leaveRangeLabel } from "@/lib/leave";
import { leaveStatusLabels } from "@/lib/labels";
import { formatMxDateInput, mxSlotStart } from "@/lib/utils";

/**
 * Resúmenes para Coordinación Servicios de Atención Privada, que supervisa lo
 * que hacen las otras cinco.
 *
 * Las cinco se reportan con la misma forma —unas cuantas cifras y una lista de
 * actividad reciente— para que la pantalla sea un solo componente en vez de
 * cinco tableros distintos. Lo que cambia es qué se cuenta en cada una.
 */

export interface SummaryStat {
  label: string;
  value: string;
  hint?: string;
}

export type ActivityTone = "default" | "success" | "warning" | "destructive";

export interface ActivityItem {
  id: string;
  title: string;
  detail: string | null;
  /** ISO. Fecha del hecho: la ausencia, el evento, el cumpleaños. */
  when: string;
  status?: string;
  tone?: ActivityTone;
}

export interface CoordinationSummary {
  position: Position;
  stats: SummaryStat[];
  activity: ActivityItem[];
}

/** Cuántos elementos de historial se traen por coordinación. */
const ACTIVITY_LIMIT = 8;

const leaveTone: Record<LeaveStatus, ActivityTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

function rangeFilter(from: Date | null, to: Date | null, field: string) {
  if (!from && !to) return {};
  return {
    [field]: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  };
}

export async function buildCoordinationSummaries(
  from: Date | null,
  to: Date | null,
): Promise<CoordinationSummary[]> {
  const now = new Date();

  const [
    survey,
    leaveCounts,
    recentLeaves,
    communityEvents,
    upcomingCommunity,
    humanCapitalEvents,
    upcomingHumanCapital,
    birthdayParties,
    peopleWithBirthday,
    peopleTotal,
  ] = await Promise.all([
    buildSurveyReport(from, to),

    db.leaveRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: rangeFilter(from, to, "startDate"),
    }),
    db.leaveRequest.findMany({
      where: rangeFilter(from, to, "startDate"),
      orderBy: { requestedAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        unit: true,
        quantity: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        status: true,
        psychologist: { select: { user: { select: { name: true } } } },
      },
    }),

    db.calendarEvent.findMany({
      where: { kind: EventKind.COMMUNITY, ...rangeFilter(from, to, "startAt") },
      orderBy: { startAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        title: true,
        location: true,
        startAt: true,
        _count: { select: { attendees: true } },
      },
    }),
    db.calendarEvent.count({
      where: { kind: EventKind.COMMUNITY, startAt: { gte: now } },
    }),

    db.calendarEvent.findMany({
      where: { kind: EventKind.HUMAN_CAPITAL, ...rangeFilter(from, to, "startAt") },
      orderBy: { startAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: { id: true, title: true, location: true, startAt: true },
    }),
    db.calendarEvent.count({
      where: { kind: EventKind.HUMAN_CAPITAL, startAt: { gte: now } },
    }),

    db.calendarEvent.findMany({
      where: {
        kind: EventKind.BIRTHDAY_PARTY,
        ...rangeFilter(from, to, "startAt"),
      },
      orderBy: { startAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: { id: true, title: true, location: true, startAt: true },
    }),
    db.user.findMany({
      where: { isActive: true, birthDate: { not: null } },
      select: { id: true, name: true, birthDate: true },
    }),
    db.user.count({ where: { isActive: true } }),
  ]);

  const leaveCount = (s: LeaveStatus) =>
    leaveCounts.find((c) => c.status === s)?._count._all ?? 0;

  // Cumpleaños del mes en curso. Se comparan mes y día —la fecha guardada trae
  // el año de nacimiento, no el de este año— y en hora de Ciudad de México,
  // porque el servidor va en UTC.
  const currentMonth = formatMxDateInput(now).slice(5, 7);
  const birthdaysThisMonth = peopleWithBirthday
    .map((p) => {
      const [, month, day] = formatMxDateInput(p.birthDate!).split("-");
      return { ...p, month, day };
    })
    .filter((p) => p.month === currentMonth)
    .sort((a, b) => a.day.localeCompare(b.day));

  return [
    {
      position: Position.INNOVATION_RESEARCH,
      stats: [
        { label: "Respuestas recibidas", value: String(survey.totalResponses) },
        {
          label: "Satisfacción promedio",
          value:
            survey.overallSatisfaction != null
              ? `${survey.overallSatisfaction} / 3`
              : "—",
        },
      ],
      // La encuesta es anónima: no hay actividad individual que listar sin
      // romper esa promesa, así que se resume por pregunta.
      activity: survey.questions
        .filter((q) => q.answered > 0)
        .map((q) => {
          const top = [...q.options].sort((a, b) => b.count - a.count)[0];
          return {
            id: q.id,
            title: q.text,
            detail: `${q.answered} respuesta${q.answered === 1 ? "" : "s"} · más frecuente: ${top.label} (${top.percent}%)`,
            when: to?.toISOString() ?? now.toISOString(),
          };
        }),
    },

    {
      position: Position.PROFESSIONAL_DEVELOPMENT,
      stats: [
        {
          label: "Pendientes",
          value: String(leaveCount(LeaveStatus.PENDING)),
          hint: "Por revisar",
        },
        { label: "Aceptadas", value: String(leaveCount(LeaveStatus.APPROVED)) },
        { label: "Rechazadas", value: String(leaveCount(LeaveStatus.REJECTED)) },
      ],
      activity: recentLeaves.map((l) => ({
        id: l.id,
        title: l.psychologist.user.name,
        detail: `${l.quantity} ${l.unit === LeaveUnit.HOURS ? "hora(s)" : "día(s)"} · ${leaveRangeLabel(l)}`,
        when: l.startDate.toISOString(),
        status: leaveStatusLabels[l.status],
        tone: leaveTone[l.status],
      })),
    },

    {
      position: Position.COMMUNITY_OUTREACH,
      stats: [
        { label: "Eventos en el periodo", value: String(communityEvents.length) },
        {
          label: "Próximos",
          value: String(upcomingCommunity),
          hint: "Desde hoy, sin importar el filtro",
        },
      ],
      activity: communityEvents.map((e) => ({
        id: e.id,
        title: e.title,
        detail: [
          e.location,
          `${e._count.attendees} invitado${e._count.attendees === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" · "),
        when: e.startAt.toISOString(),
      })),
    },

    {
      position: Position.HUMAN_CAPITAL,
      stats: [
        {
          label: "Eventos en el periodo",
          value: String(humanCapitalEvents.length),
        },
        {
          label: "Próximos",
          value: String(upcomingHumanCapital),
          hint: "Desde hoy, sin importar el filtro",
        },
      ],
      activity: humanCapitalEvents.map((e) => ({
        id: e.id,
        title: e.title,
        detail: e.location,
        when: e.startAt.toISOString(),
      })),
    },

    {
      position: Position.BIRTHDAYS,
      stats: [
        {
          label: "Fechas registradas",
          value: `${peopleWithBirthday.length} / ${peopleTotal}`,
          hint: "Del personal activo",
        },
        { label: "Cumpleaños este mes", value: String(birthdaysThisMonth.length) },
        { label: "Festejos en el periodo", value: String(birthdayParties.length) },
      ],
      activity: [
        ...birthdaysThisMonth.map((p) => ({
          id: `bd-${p.id}`,
          title: p.name,
          detail: "Cumpleaños del mes",
          when: mxSlotStart(
            `${formatMxDateInput(now).slice(0, 4)}-${p.month}-${p.day}`,
            "00:00",
          ).toISOString(),
        })),
        ...birthdayParties.map((e) => ({
          id: e.id,
          title: e.title,
          detail: e.location,
          when: e.startAt.toISOString(),
          status: "Festejo",
        })),
      ]
        .sort((a, b) => b.when.localeCompare(a.when))
        .slice(0, ACTIVITY_LIMIT),
    },
  ];
}
