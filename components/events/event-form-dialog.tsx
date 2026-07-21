"use client";

import { useEffect, useState } from "react";
import { format, addHours, parse } from "date-fns";
import { EventKind, EventScope } from "@prisma/client";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Psychologist {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  kind: EventKind;
  scope: EventScope;
}

/** Suma una hora a "HH:mm" para proponer la hora de fin. */
function plusOneHour(time: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return time;
  return format(addHours(parse(time, "HH:mm", new Date()), 1), "HH:mm");
}

export function EventFormDialog({
  open,
  onOpenChange,
  onCreated,
  kind,
  scope,
}: Props) {
  const { toast } = useToast();
  const needsAttendees = scope === EventScope.SELECTED;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle("");
    setDescription("");
    setDay(format(new Date(), "yyyy-MM-dd"));
    setStartTime("09:00");
    setEndTime("10:00");
    setLocation("");
    setAttendeeIds([]);
  }, [open]);

  useEffect(() => {
    if (!open || !needsAttendees) return;
    fetch("/api/psychologists")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPsychologists);
  }, [open, needsAttendees]);

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        location: location || null,
        startAt: new Date(`${day}T${startTime}`).toISOString(),
        endAt: new Date(`${day}T${endTime}`).toISOString(),
        kind,
        scope,
        attendeeIds: needsAttendees ? attendeeIds : [],
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo crear el evento.");
      return;
    }

    toast({
      title: "Evento creado",
      description: needsAttendees
        ? "Se notificó a los psicólogos invitados."
        : "Se notificó a todo el equipo.",
      variant: "success",
    });
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo evento</DialogTitle>
          <DialogDescription>
            {kind === EventKind.BIRTHDAY_PARTY
              ? "Se muestra en el calendario de todo el equipo."
              : needsAttendees
                ? "Se notifica a los psicólogos invitados y se les bloquea la agenda a esa hora."
                : "Se notifica a todo el equipo y se bloquea la agenda a esa hora."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ev-title">Nombre del evento *</Label>
            <Input
              id="ev-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Jornada de salud mental"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-desc">Descripción</Label>
            <Textarea
              id="ev-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-day">Fecha *</Label>
            <Input
              id="ev-day"
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ev-start">Hora *</Label>
              <Input
                id="ev-start"
                type="time"
                required
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  // La hora de fin se propone sola; sigue siendo editable.
                  if (e.target.value >= endTime) {
                    setEndTime(plusOneHour(e.target.value));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-end">Termina *</Label>
              <Input
                id="ev-end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-place">Lugar del evento *</Label>
            <Input
              id="ev-place"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ej. Auditorio CEDAFAM"
            />
          </div>

          {needsAttendees && (
            <div className="space-y-2">
              <Label>Psicólogos invitados *</Label>
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
                {attendeeIds.length} seleccionado
                {attendeeIds.length === 1 ? "" : "s"}. Solo a ellos se les
                bloquea la agenda.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || (needsAttendees && attendeeIds.length === 0)
              }
            >
              {submitting ? "Creando…" : "Crear evento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
