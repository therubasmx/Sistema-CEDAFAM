"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus, CalendarClock } from "lucide-react";
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
import { appointmentStatusLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const statusVariant: Record<AppointmentStatus, BadgeProps["variant"]> = {
  SCHEDULED: "default",
  ATTENDED: "success",
  NO_SHOW: "destructive",
  CANCELLED: "secondary",
};

type View = "day" | "week" | "month";

interface Psychologist {
  id: string;
  name: string;
}

interface CalendarViewProps {
  role: Role;
  psychologistId: string | null;
  /** Preselect a psychologist filter (e.g. linked from the dashboard). */
  initialFilterPsy?: string;
  /** Preselect the initial view (day/week/month). */
  initialView?: View;
}

const ALL = "ALL";

export function CalendarView({
  role,
  psychologistId,
  initialFilterPsy,
  initialView,
}: CalendarViewProps) {
  const [view, setView] = useState<View>(initialView ?? "week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
    const [apptRes, eventRes] = await Promise.all([
      fetch(`/api/calendar?${params.toString()}`),
      fetch(`/api/calendar/events?${eventParams.toString()}`),
    ]);
    if (apptRes.ok) setAppointments(await apptRes.json());
    if (eventRes.ok) setEvents(await eventRes.json());
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

  const rangeLabel =
    view === "day"
      ? format(anchor, "EEEE d 'de' MMMM yyyy", { locale: es })
      : view === "week"
        ? `${format(rangeStart, "d MMM", { locale: es })} – ${format(rangeEnd, "d MMM yyyy", { locale: es })}`
        : format(anchor, "MMMM yyyy", { locale: es });

  function EventChip({ ev }: { ev: CalendarEvent }) {
    return (
      <button
        onClick={() => openViewEvent(ev)}
        className="w-full rounded border border-amber-500/50 bg-amber-100 p-1.5 text-left text-xs text-amber-900 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium">
            {format(new Date(ev.startAt), "HH:mm")}
          </span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            Evento
          </Badge>
        </div>
        <div className="truncate font-medium">{ev.title}</div>
      </button>
    );
  }

  function ApptChip({ a }: { a: CalendarAppointment }) {
    return (
      <button
        onClick={() => openEditAppt(a)}
        className="w-full rounded border bg-background p-1.5 text-left text-xs hover:bg-accent"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium">
            {format(new Date(a.scheduledAt), "HH:mm")}
          </span>
          <Badge variant={statusVariant[a.status]} className="px-1.5 py-0 text-[10px]">
            {appointmentStatusLabels[a.status]}
          </Badge>
        </div>
        <div className="truncate">{a.patient.fullName}</div>
        {isGlobal && (
          <div className="truncate text-[10px] text-muted-foreground">
            {a.psychologist.user.name}
          </div>
        )}
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium capitalize">{rangeLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            {viewTabs.map((t) => (
              <button
                key={t.key}
                onClick={t.onClick}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
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

      {/* ── Vista Día ────────────────────────────────────────────── */}
      {view === "day" && (
        <div
          className={cn(
            "rounded-md border bg-card p-3",
            isToday(anchor) && "border-primary ring-1 ring-primary",
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
            {eventsForDay(anchor).map((ev) => (
              <EventChip key={ev.id} ev={ev} />
            ))}
            {apptsForDay(anchor).map((a) => (
              <ApptChip key={a.id} a={a} />
            ))}
            {eventsForDay(anchor).length === 0 &&
              apptsForDay(anchor).length === 0 && (
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
          {gridDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-h-[8rem] flex-col rounded-md border bg-card p-2",
                isToday(day) && "border-primary ring-1 ring-primary",
              )}
            >
              <button
                onClick={() => openCreateAppt(day)}
                className="mb-2 flex items-center justify-between text-left"
              >
                <span className="text-xs font-semibold capitalize">
                  {format(day, "EEE d", { locale: es })}
                </span>
                <Plus className="h-3 w-3 text-muted-foreground" />
              </button>
              <div className="space-y-1">
                {eventsForDay(day).map((ev) => (
                  <EventChip key={ev.id} ev={ev} />
                ))}
                {apptsForDay(day).map((a) => (
                  <ApptChip key={a.id} a={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Vista Mensual ────────────────────────────────────────── */}
      {view === "month" && (
        <div className="overflow-hidden rounded-md border">
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
                    "min-h-[6.5rem] border-b border-r p-1.5",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <button
                      onClick={() => {
                        setView("day");
                        setAnchor(day);
                      }}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium hover:bg-accent",
                        isToday(day) && "bg-primary text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                    <button
                      onClick={() => openCreateAppt(day)}
                      className="rounded p-0.5 hover:bg-accent"
                      aria-label="Nueva cita"
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => openViewEvent(ev)}
                        className="block w-full truncate rounded bg-amber-100 px-1 py-0.5 text-left text-[10px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayAppts.slice(0, 2).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => openEditAppt(a)}
                        className="block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-[10px] text-foreground hover:bg-primary/20"
                      >
                        {format(new Date(a.scheduledAt), "HH:mm")} {a.patient.fullName}
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

      {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

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
      />
    </div>
  );
}
