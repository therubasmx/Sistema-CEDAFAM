"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  AppointmentStatus,
  Role,
  type AppointmentServiceType,
} from "@prisma/client";
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
import { appointmentStatusLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const statusVariant: Record<AppointmentStatus, BadgeProps["variant"]> = {
  SCHEDULED: "default",
  ATTENDED: "success",
  NO_SHOW: "destructive",
  CANCELLED: "secondary",
};

interface Psychologist {
  id: string;
  name: string;
}

interface CalendarViewProps {
  role: Role;
  psychologistId: string | null;
}

const ALL = "ALL";

export function CalendarView({ role, psychologistId }: CalendarViewProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [filterPsy, setFilterPsy] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarAppointment | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

  const isGlobal = role !== Role.PSYCHOLOGIST;
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    });
    if (isGlobal && filterPsy !== ALL) params.set("psychologistId", filterPsy);
    const res = await fetch(`/api/calendar?${params.toString()}`);
    if (res.ok) setAppointments(await res.json());
    setLoading(false);
  }, [weekStart, weekEnd, isGlobal, filterPsy]);

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

  function openCreate(day?: Date) {
    setEditing(null);
    setDefaultDate(day ? format(day, "yyyy-MM-dd'T'09:00") : undefined);
    setDialogOpen(true);
  }
  function openEdit(appt: CalendarAppointment) {
    setEditing(appt);
    setDefaultDate(undefined);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor((d) => subWeeks(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor((d) => addWeeks(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium">
            {format(weekStart, "d MMM", { locale: es })} –{" "}
            {format(weekEnd, "d MMM yyyy", { locale: es })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isGlobal && (
            <Select value={filterPsy} onValueChange={setFilterPsy}>
              <SelectTrigger className="w-48">
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
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> Nueva cita
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const dayAppts = appointments
            .filter((a) => isSameDay(new Date(a.scheduledAt), day))
            .sort(
              (a, b) =>
                new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
            );
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-h-[8rem] flex-col rounded-md border bg-card p-2",
                isToday(day) && "border-primary ring-1 ring-primary",
              )}
            >
              <button
                onClick={() => openCreate(day)}
                className="mb-2 flex items-center justify-between text-left"
              >
                <span className="text-xs font-semibold capitalize">
                  {format(day, "EEE d", { locale: es })}
                </span>
                <Plus className="h-3 w-3 text-muted-foreground" />
              </button>
              <div className="space-y-1">
                {dayAppts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => openEdit(a)}
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
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
        role={role}
        psychologistId={psychologistId}
        appointment={editing}
        defaultDate={defaultDate}
      />
    </div>
  );
}
