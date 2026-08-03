"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { EventScope } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { CalendarDayPicker } from "@/components/ui/calendar-day-picker";
import { cn } from "@/lib/utils";

interface Psychologist {
  id: string;
  name: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  coordination?: string | null;
  createdBy?: { name: string };
}

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Evento existente (modo ver/eliminar) o null para crear. */
  event?: CalendarEvent | null;
  /** Fecha pre-seleccionada (yyyy-MM-dd) al crear desde una celda. */
  defaultDay?: string;
  /** Si el usuario puede crear/eliminar (jefatura/coordinación). */
  canManage?: boolean;
  /** Coordinación del usuario actual; el evento se registra a su nombre. */
  creatorCoordination?: string | null;
}

export function EventDialog({
  open,
  onOpenChange,
  onSaved,
  event,
  defaultDay,
  canManage = true,
  creatorCoordination,
}: EventDialogProps) {
  const { toast } = useToast();
  const isView = !!event;

  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (event) {
      setTitle(event.title);
      setDay(format(new Date(event.startAt), "yyyy-MM-dd"));
      setStartTime(format(new Date(event.startAt), "HH:mm"));
      setEndTime(format(new Date(event.endAt), "HH:mm"));
    } else {
      setTitle("");
      setDay(defaultDay ?? format(new Date(), "yyyy-MM-dd"));
      setStartTime("09:00");
      setEndTime("10:00");
      setAttendeeIds([]);
    }
  }, [open, event, defaultDay]);

  useEffect(() => {
    if (!open || isView) return;
    fetch("/api/psychologists")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPsychologists);
  }, [open, isView]);

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      title,
      startAt: new Date(`${day}T${startTime}`).toISOString(),
      endAt: new Date(`${day}T${endTime}`).toISOString(),
      scope: attendeeIds.length > 0 ? EventScope.SELECTED : EventScope.ALL,
      attendeeIds,
    };

    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear el evento.");
      return;
    }
    toast({ title: "Evento creado", variant: "success" });
    onSaved();
    onOpenChange(false);
  }

  async function onDelete() {
    if (!event) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/calendar/events/${event.id}`, {
      method: "DELETE",
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar el evento.");
      return;
    }
    toast({ title: "Evento eliminado", variant: "success" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isView ? "Evento" : "Nuevo evento"}</DialogTitle>
          <DialogDescription>
            {isView
              ? "Este horario está bloqueado para agendar citas."
              : "Evento interno visible para todos los psicólogos. Bloquea el agendado de citas en su horario."}
          </DialogDescription>
        </DialogHeader>

        {isView ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold">{event!.title}</p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(event!.startAt), "EEEE d 'de' MMMM, HH:mm", {
                  locale: es,
                })}
                {" – "}
                {format(new Date(event!.endAt), "HH:mm")}
              </p>
              {event!.coordination && (
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Coordinación de {event!.coordination}
                </p>
              )}
              {event!.createdBy && (
                <p className="text-xs text-muted-foreground">
                  Creado por {event!.createdBy.name}
                </p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </Button>
              {canManage && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onDelete}
                  disabled={submitting}
                >
                  {submitting ? "Eliminando…" : "Eliminar evento"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {creatorCoordination && (
              <p className="rounded-md border border-amber-500/40 bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Se registrará a nombre de{" "}
                <strong>Coordinación de {creatorCoordination}</strong>.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="event-title">Nombre del evento *</Label>
              <Input
                id="event-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Junta general"
              />
            </div>

            <div className="space-y-2">
              <Label>Fecha *</Label>
              <CalendarDayPicker value={day} onChange={setDay} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-start">Hora de inicio *</Label>
                <Input
                  id="event-start"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">Hora de fin *</Label>
                <Input
                  id="event-end"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Invitar a:</Label>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                {psychologists.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">
                    Cargando psicólogos…
                  </p>
                ) : (
                  psychologists.map((p) => {
                    const checked = attendeeIds.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleAttendee(p.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                          checked ? "bg-primary/10" : "hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input",
                          )}
                          aria-hidden
                        >
                          {checked ? "✓" : ""}
                        </span>
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {attendeeIds.length === 0
                  ? "Deja vacío para invitar a todo el equipo."
                  : `${attendeeIds.length} seleccionado${attendeeIds.length === 1 ? "" : "s"}. Solo a ellos se les bloquea la agenda.`}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !title}>
                {submitting ? "Guardando…" : "Crear evento"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
