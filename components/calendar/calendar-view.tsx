"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarClock,
  Cake,
  Clock,
  User,
  Users,
  MapPin,
  Loader2,
} from "lucide-react";
import { AppointmentStatus, Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppointmentDialog,
  type CalendarAppointment,
} from "@/components/calendar/appointment-dialog";
import {
  EventDialog,
  type CalendarEvent,
} from "@/components/calendar/event-dialog";
import { appointmentStatusLabels, roomLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const statusVariant: Record<AppointmentStatus, BadgeProps["variant"]> = {
  PENDING: "warning",
  SCHEDULED: "default",
  ATTENDED: "success",
  NO_SHOW: "destructive",
  CANCELLED: "secondary",
  REJECTED: "destructive",
  RESCHEDULED: "secondary",
};

/** Color de acento (borde izquierdo + leyenda) por estado; el texto del badge sigue llevando la etiqueta, el color nunca es el único indicador. */
const statusAccent: Record<AppointmentStatus, string> = {
  PENDING: "border-l-amber-500 dark:border-l-amber-400",
  SCHEDULED: "border-l-primary",
  ATTENDED: "border-l-emerald-500 dark:border-l-emerald-400",
  NO_SHOW: "border-l-red-500 dark:border-l-red-400",
  CANCELLED: "border-l-slate-400 dark:border-l-slate-500",
  REJECTED: "border-l-red-500 dark:border-l-red-400",
  RESCHEDULED: "border-l-slate-400 dark:border-l-slate-500",
};

const statusDot: Record<AppointmentStatus, string> = {
  PENDING: "bg-amber-500",
  SCHEDULED: "bg-primary",
  ATTENDED: "bg-emerald-500",
  NO_SHOW: "bg-red-500",
  CANCELLED: "bg-slate-400",
  REJECTED: "bg-red-500",
  RESCHEDULED: "bg-slate-400",
};

const legendStatuses = Object.keys(appointmentStatusLabels) as AppointmentStatus[];

type View = "day" | "week" | "month";

interface Psychologist {
  id: string;
  name: string;
}

/** Cumpleaños proyectado al rango visible; es informativo, no bloquea agenda. */
interface Birthday {
  userId: string;
  name: string;
  date: string;
  turningAge: number | null;
}

interface CalendarViewProps {
  role: Role;
  psychologistId: string | null;
  /** Coordinación del usuario actual; los eventos que cree se etiquetan con ella. */
  coordination?: string | null;
  /** Preselect a psychologist filter (e.g. linked from the dashboard). */
  initialFilterPsy?: string;
  /** Preselect the initial view (day/week/month). */
  initialView?: View;
  /** Abrir directo una cita (p. ej. desde una notificación). */
  initialAppointmentId?: string;
}

const ALL = "ALL";

export function CalendarView({
  role,
  psychologistId,
  coordination,
  initialFilterPsy,
  initialView,
  initialAppointmentId,
}: CalendarViewProps) {
  const [view, setView] = useState<View>(initialView ?? "week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [filterPsy, setFilterPsy] = useState<string>(initialFilterPsy ?? ALL);
  const [loading, setLoading] = useState(true);

  const [apptDialogOpen, setApptDialogOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<CalendarAppointment | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [eventDefaultDay, setEventDefaultDay] = useState<string | undefined>();

  const isGlobal = role !== Role.PSYCHOLOGIST;
  const canManageEvents = role === Role.ADMIN || role === Role.COORDINATOR;

  const { rangeStart, rangeEnd, gridDays } = useMemo(() => {
    if (view === "day") {
      const s = startOfDay(anchor);
      return { rangeStart: s, rangeEnd: endOfDay(anchor), gridDays: [s] };
    }
    if (view === "week") {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      return { rangeStart: s, rangeEnd: e, gridDays: eachDayOfInterval({ start: s, end: e }) };
    }
    const s = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const e = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return { rangeStart: s, rangeEnd: e, gridDays: eachDayOfInterval({ start: s, end: e }) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
    });
    if (isGlobal && filterPsy !== ALL) params.set("psychologistId", filterPsy);
    const eventParams = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
    });
    const [apptRes, eventRes, birthdayRes] = await Promise.all([
      fetch(`/api/calendar?${params.toString()}`),
      fetch(`/api/calendar/events?${eventParams.toString()}`),
      fetch(`/api/calendar/birthdays?${eventParams.toString()}`),
    ]);
    if (apptRes.ok) setAppointments(await apptRes.json());
    if (eventRes.ok) setEvents(await eventRes.json());
    if (birthdayRes.ok) setBirthdays(await birthdayRes.json());
    setLoading(false);
  }, [rangeStart, rangeEnd, isGlobal, filterPsy]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isGlobal) {
      fetch("/api/psychologists")
        .then((r) => (r.ok ? r.json() : []))
        .then(setPsychologists);
    }
  }, [isGlobal]);

  // Abrir directo una cita (llegada desde una notificación).
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (!initialAppointmentId || openedFromLink.current) return;
    openedFromLink.current = true;
    fetch(`/api/appointments/${initialAppointmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((appt: CalendarAppointment | null) => {
        if (!appt) return;
        setAnchor(new Date(appt.scheduledAt));
        setEditingAppt(appt);
        setDefaultDate(undefined);
        setApptDialogOpen(true);
      })
      .finally(() => {
        // Limpiar el parámetro para no reabrir al recargar/navegar.
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("appointmentId");
          window.history.replaceState({}, "", url.toString());
        }
      });
  }, [initialAppointmentId]);

  function goPrev() {
    setAnchor((d) =>
      view === "day" ? subDays(d, 1) : view === "week" ? subWeeks(d, 1) : subMonths(d, 1),
    );
  }
  function goNext() {
    setAnchor((d) =>
      view === "day" ? addDays(d, 1) : view === "week" ? addWeeks(d, 1) : addMonths(d, 1),
    );
  }

  function openCreateAppt(day?: Date) {
    setEditingAppt(null);
    setDefaultDate(day ? format(day, "yyyy-MM-dd'T'09:00") : undefined);
    setApptDialogOpen(true);
  }
  function openEditAppt(appt: CalendarAppointment) {
    setEditingAppt(appt);
    setDefaultDate(undefined);
    setApptDialogOpen(true);
  }
  function openCreateEvent(day?: Date) {
    setViewingEvent(null);
    setEventDefaultDay(day ? format(day, "yyyy-MM-dd") : undefined);
    setEventDialogOpen(true);
  }
  function openViewEvent(ev: CalendarEvent) {
    setViewingEvent(ev);
    setEventDefaultDay(undefined);
    setEventDialogOpen(true);
  }

  function apptsForDay(day: Date) {
    return appointments
      .filter((a) => isSameDay(new Date(a.scheduledAt), day))
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
  }
  function eventsForDay(day: Date) {
    return events
      .filter((e) => isSameDay(new Date(e.startAt), day))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }
  function birthdaysForDay(day: Date) {
    return birthdays.filter((b) => isSameDay(new Date(b.date), day));
  }

  const rangeLabel =
    view === "day"
      ? format(anchor, "EEEE d 'de' MMMM yyyy", { locale: es })
      : view === "week"
        ? `${format(rangeStart, "d MMM", { locale: es })} – ${format(rangeEnd, "d MMM yyyy", { locale: es })}`
        : format(anchor, "MMMM yyyy", { locale: es });

  /** Chip informativo: se distingue en morado de los eventos que sí bloquean. */
  function BirthdayChip({ b }: { b: Birthday }) {
    return (
      <div className="w-full rounded-lg border border-l-4 border-violet-500/40 border-l-violet-500 bg-violet-50 p-2 text-xs text-violet-900 shadow-sm dark:bg-violet-950/30 dark:text-violet-200">
        <div className="flex items-center gap-1.5 font-medium">
          <Cake className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{b.name}</span>
        </div>
        <div className="text-[10px] opacity-80">
          Cumpleaños{b.turningAge ? ` · ${b.turningAge} años` : ""}
        </div>
      </div>
    );
  }

  function EventChip({ ev }: { ev: CalendarEvent }) {
    return (
      <button
        onClick={() => openViewEvent(ev)}
        className="w-full rounded-lg border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-50 p-2 text-left text-xs text-amber-900 shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1 font-semibold tabular-nums">
            <Clock className="h-3 w-3 shrink-0 opacity-70" />
            {format(new Date(ev.startAt), "h:mm a")}
          </span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            Evento
          </Badge>
        </div>
        <div className="truncate font-medium">{ev.title}</div>
        {ev.coordination && (
          <div className="truncate text-[10px] opacity-80">
            Coord. {ev.coordination}
          </div>
        )}
      </button>
    );
  }

  function ApptChip({ a }: { a: CalendarAppointment }) {
    return (
      <button
        onClick={() => openEditAppt(a)}
        className={cn(
          "w-full rounded-lg border border-l-4 bg-card p-2 text-left text-xs shadow-sm transition-shadow duration-200 hover:shadow-md hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          statusAccent[a.status],
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1 font-semibold tabular-nums">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            {format(new Date(a.scheduledAt), "h:mm a")}
          </span>
          <Badge variant={statusVariant[a.status]} className="px-1.5 py-0 text-[10px]">
            {appointmentStatusLabels[a.status]}
          </Badge>
        </div>
        <div className="truncate pt-1 text-sm font-medium text-foreground">
          {a.patient.fullName}
        </div>
        {a.isFirstVisit ? (
          <span className="mt-1 inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-sky-700 bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300">
            Primera vez
          </span>
        ) : (
          <div className="mt-1 truncate text-[10px] text-muted-foreground">Seguimiento</div>
        )}
        <div className="mt-1 space-y-0.5">
          {isGlobal && (
            <div className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <User className="h-2.5 w-2.5 shrink-0" />
              {a.psychologist.user.name}
            </div>
          )}
          {!isGlobal && a.psychologist.id !== psychologistId && (
            <div className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <User className="h-2.5 w-2.5 shrink-0" />
              {a.psychologist.user.name} (principal)
            </div>
          )}
          {a.coTherapist && (
            <div className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <Users className="h-2.5 w-2.5 shrink-0" />
              Coterapia: {a.coTherapist.user.name}
            </div>
          )}
          {a.room && (
            <div
              className={cn(
                "flex items-center gap-1 truncate text-[10px]",
                a.roomStatus === "PENDING"
                  ? "text-amber-600 dark:text-amber-400"
                  : a.roomStatus === "REJECTED"
                    ? "text-destructive line-through"
                    : "text-muted-foreground",
              )}
            >
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {roomLabels[a.room]}
              {a.roomStatus === "PENDING" && " · por autorizar"}
            </div>
          )}
        </div>
      </button>
    );
  }

  const viewTabs: { key: View; label: string; onClick: () => void }[] = [
    { key: "day", label: "Hoy", onClick: () => { setView("day"); setAnchor(new Date()); } },
    { key: "week", label: "Semana", onClick: () => setView("week") },
    { key: "month", label: "Mensual", onClick: () => setView("month") },
  ];

  return (
    <div className="space-y-4">
      {/* ── Barra de herramientas ────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Periodo anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Periodo siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 flex items-center gap-2 text-sm font-medium capitalize">
            {rangeLabel}
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            {viewTabs.map((t) => (
              <button
                key={t.key}
                onClick={t.onClick}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {isGlobal && (
            <Select value={filterPsy} onValueChange={setFilterPsy}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Psicólogo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los psicólogos</SelectItem>
                {psychologists.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {canManageEvents && (
            <Button variant="outline" onClick={() => openCreateEvent()}>
              <CalendarClock className="h-4 w-4" /> Añadir evento
            </Button>
          )}
          <Button onClick={() => openCreateAppt()}>
            <Plus className="h-4 w-4" /> Nueva cita
          </Button>
        </div>
      </div>

      {/* ── Leyenda de estados (solo aplica a las vistas Día/Semana) ── */}
      {view !== "month" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/70">Estado:</span>
          {legendStatuses.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot[s])} />
              {appointmentStatusLabels[s]}
            </span>
          ))}
        </div>
      )}

      {/* ── Vista Día ────────────────────────────────────────────── */}
      {view === "day" && (
        <div
          className={cn(
            "rounded-lg border bg-card p-3 shadow-sm",
            isToday(anchor) && "border-primary/60 ring-1 ring-primary/20",
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold capitalize">
              {format(anchor, "EEEE d 'de' MMMM", { locale: es })}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => openCreateAppt(anchor)}>
              <Plus className="h-4 w-4" /> Cita
            </Button>
          </div>
          <div className="space-y-2">
            {birthdaysForDay(anchor).map((b) => (
              <BirthdayChip key={b.userId} b={b} />
            ))}
            {eventsForDay(anchor).map((ev) => (
              <EventChip key={ev.id} ev={ev} />
            ))}
            {apptsForDay(anchor).map((a) => (
              <ApptChip key={a.id} a={a} />
            ))}
            {eventsForDay(anchor).length === 0 &&
              apptsForDay(anchor).length === 0 &&
              birthdaysForDay(anchor).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin citas ni eventos este día.
                </p>
              )}
          </div>
        </div>
      )}

      {/* ── Vista Semana ─────────────────────────────────────────── */}
      {view === "week" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {gridDays.map((day) => {
            const dayBirthdays = birthdaysForDay(day);
            const dayEvents = eventsForDay(day);
            const dayAppts = apptsForDay(day);
            const total = dayBirthdays.length + dayEvents.length + dayAppts.length;
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex min-h-[8rem] flex-col rounded-lg border bg-card p-2 transition-colors",
                  today
                    ? "border-primary/60 ring-1 ring-primary/20 bg-primary/[0.03]"
                    : "hover:border-primary/30",
                )}
              >
                <div className="mb-2 flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        today ? "bg-primary text-primary-foreground" : "text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {format(day, "EEE", { locale: es })}
                      </span>
                      {total > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {total} {total === 1 ? "evento" : "eventos"}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openCreateAppt(day)}
                    aria-label={`Nueva cita el ${format(day, "d 'de' MMMM", { locale: es })}`}
                    className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col space-y-1">
                  {dayBirthdays.map((b) => (
                    <BirthdayChip key={b.userId} b={b} />
                  ))}
                  {dayEvents.map((ev) => (
                    <EventChip key={ev.id} ev={ev} />
                  ))}
                  {dayAppts.map((a) => (
                    <ApptChip key={a.id} a={a} />
                  ))}
                  {total === 0 && (
                    <div className="flex flex-1 items-center justify-center py-4">
                      <p className="text-center text-[11px] text-muted-foreground">
                        Sin citas
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Vista Mensual ────────────────────────────────────────── */}
      {view === "month" && (
        <div className="overflow-hidden rounded-lg border shadow-sm">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="p-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const dayEvents = eventsForDay(day);
              const dayAppts = apptsForDay(day);
              const inMonth = isSameMonth(day, anchor);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[6.5rem] border-b border-r p-1.5 transition-colors hover:bg-accent/20",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      onClick={() => {
                        setView("day");
                        setAnchor(day);
                      }}
                      aria-label={`Ver ${format(day, "d 'de' MMMM", { locale: es })}`}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isToday(day) && "bg-primary text-primary-foreground hover:bg-primary",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                    <button
                      onClick={() => openCreateAppt(day)}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Nueva cita el ${format(day, "d 'de' MMMM", { locale: es })}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {birthdaysForDay(day).map((b) => (
                      <div
                        key={b.userId}
                        className="flex items-center gap-1 truncate rounded bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
                        title={`Cumpleaños de ${b.name}`}
                      >
                        <Cake className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{b.name}</span>
                      </div>
                    ))}
                    {dayEvents.slice(0, 2).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => openViewEvent(ev)}
                        className="block w-full truncate rounded bg-amber-100 px-1 py-0.5 text-left text-[10px] font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/50"
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayAppts.slice(0, 2).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => openEditAppt(a)}
                        title={a.isFirstVisit ? "Primera vez" : "Seguimiento"}
                        className={cn(
                          "block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-foreground transition-colors",
                          a.isFirstVisit
                            ? "bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/40 dark:hover:bg-sky-900/50"
                            : "bg-primary/10 hover:bg-primary/20",
                        )}
                      >
                        {format(new Date(a.scheduledAt), "h:mm a")} {a.patient.fullName}
                      </button>
                    ))}
                    {dayEvents.length + dayAppts.length > 4 && (
                      <button
                        onClick={() => {
                          setView("day");
                          setAnchor(day);
                        }}
                        className="text-[10px] text-muted-foreground hover:underline"
                      >
                        +{dayEvents.length + dayAppts.length - 4} más
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AppointmentDialog
        open={apptDialogOpen}
        onOpenChange={setApptDialogOpen}
        onSaved={load}
        role={role}
        psychologistId={psychologistId}
        appointment={editingAppt}
        defaultDate={defaultDate}
      />

      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        onSaved={load}
        event={viewingEvent}
        defaultDay={eventDefaultDay}
        canManage={canManageEvents}
        creatorCoordination={coordination}
      />
    </div>
  );
}
