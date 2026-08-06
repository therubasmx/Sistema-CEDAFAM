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
import { CalendarDayPicker } from "@/components/ui/calendar-day-picker";
import { AGE_RANGE_KEYS, type AgeRangeKey } from "@/lib/validators";
import { cn } from "@/lib/utils";

interface Psychologist {
  id: string;
  name: string;
}

/** Forma mínima de un evento existente que este formulario puede editar. */
export interface EditableEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  beneficiaryCount?: number | null;
  womenCount?: number | null;
  menCount?: number | null;
  ageRanges?: Partial<Record<AgeRangeKey, number>> | null;
  attendees?: { psychologistId: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  kind: EventKind;
  scope: EventScope;
  /** Si viene un evento, el formulario edita (PUT) en vez de crear (POST). */
  editing?: EditableEvent | null;
}

const EMPTY_AGE_RANGES: Record<AgeRangeKey, string> = {
  "0-12": "",
  "13-17": "",
  "18-30": "",
  "31-50": "",
  "51+": "",
};

/** Suma una hora a "HH:mm" para proponer la hora de fin. */
function plusOneHour(time: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return time;
  return format(addHours(parse(time, "HH:mm", new Date()), 1), "HH:mm");
}

export function EventFormDialog({
  open,
  onOpenChange,
  onSaved,
  kind,
  scope,
  editing = null,
}: Props) {
  const { toast } = useToast();
  const needsAttendees = scope === EventScope.SELECTED;
  // Los datos de asistencia solo se capturan al editar un evento COMMUNITY ya
  // realizado; no tiene caso pedirlos al crearlo.
  const showAttendanceStats = !!editing && kind === EventKind.COMMUNITY;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [beneficiaryCount, setBeneficiaryCount] = useState("");
  const [womenCount, setWomenCount] = useState("");
  const [menCount, setMenCount] = useState("");
  const [ageRanges, setAgeRanges] = useState<Record<AgeRangeKey, string>>(
    EMPTY_AGE_RANGES,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setDay(format(new Date(editing.startAt), "yyyy-MM-dd"));
      setStartTime(format(new Date(editing.startAt), "HH:mm"));
      setEndTime(format(new Date(editing.endAt), "HH:mm"));
      setLocation(editing.location ?? "");
      setAttendeeIds(editing.attendees?.map((a) => a.psychologistId) ?? []);
      setBeneficiaryCount(
        editing.beneficiaryCount != null ? String(editing.beneficiaryCount) : "",
      );
      setWomenCount(editing.womenCount != null ? String(editing.womenCount) : "");
      setMenCount(editing.menCount != null ? String(editing.menCount) : "");
      setAgeRanges({
        ...EMPTY_AGE_RANGES,
        ...Object.fromEntries(
          Object.entries(editing.ageRanges ?? {}).map(([k, v]) => [k, String(v)]),
        ),
      });
    } else {
      setTitle("");
      setDescription("");
      setDay(format(new Date(), "yyyy-MM-dd"));
      setStartTime("09:00");
      setEndTime("10:00");
      setLocation("");
      setAttendeeIds([]);
      setBeneficiaryCount("");
      setWomenCount("");
      setMenCount("");
      setAgeRanges(EMPTY_AGE_RANGES);
    }
  }, [open, editing]);

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

    const base = {
      title,
      description: description || null,
      location: location || null,
      startAt: new Date(`${day}T${startTime}`).toISOString(),
      endAt: new Date(`${day}T${endTime}`).toISOString(),
      attendeeIds: needsAttendees ? attendeeIds : [],
    };

    const body = editing
      ? {
          ...base,
          beneficiaryCount: beneficiaryCount === "" ? null : Number(beneficiaryCount),
          womenCount: womenCount === "" ? null : Number(womenCount),
          menCount: menCount === "" ? null : Number(menCount),
          ageRanges: showAttendanceStats
            ? Object.fromEntries(
                AGE_RANGE_KEYS.filter((k) => ageRanges[k] !== "").map((k) => [
                  k,
                  Number(ageRanges[k]),
                ]),
              )
            : null,
        }
      : { ...base, kind, scope };

    const res = await fetch(
      editing ? `/api/calendar/events/${editing.id}` : "/api/calendar/events",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? `No se pudo ${editing ? "guardar" : "crear"} el evento.`);
      return;
    }

    toast({
      title: editing ? "Evento actualizado" : "Evento creado",
      description: editing
        ? undefined
        : needsAttendees
          ? "Se notificó a los psicólogos invitados."
          : "Se notificó a todo el equipo.",
      variant: "success",
    });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar evento" : "Nuevo evento"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Corrige los datos del evento. Se avisó cuando se creó; este cambio no reenvía notificación."
              : kind === EventKind.BIRTHDAY_PARTY
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
            <Label>Fecha *</Label>
            <CalendarDayPicker value={day} onChange={setDay} />
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

          {showAttendanceStats && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Datos de asistencia</p>
              <p className="text-xs text-muted-foreground">
                Captura manual, opcional. Se llena después de realizado el
                evento.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-beneficiaries" className="text-xs">
                    Personas beneficiadas
                  </Label>
                  <Input
                    id="ev-beneficiaries"
                    type="number"
                    min={0}
                    value={beneficiaryCount}
                    onChange={(e) => setBeneficiaryCount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-women" className="text-xs">
                    Mujeres
                  </Label>
                  <Input
                    id="ev-women"
                    type="number"
                    min={0}
                    value={womenCount}
                    onChange={(e) => setWomenCount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-men" className="text-xs">
                    Hombres
                  </Label>
                  <Input
                    id="ev-men"
                    type="number"
                    min={0}
                    value={menCount}
                    onChange={(e) => setMenCount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rango de edades</Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {AGE_RANGE_KEYS.map((k) => (
                    <div key={k} className="space-y-1">
                      <span className="text-xs text-muted-foreground">{k}</span>
                      <Input
                        type="number"
                        min={0}
                        value={ageRanges[k]}
                        onChange={(e) =>
                          setAgeRanges((prev) => ({ ...prev, [k]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
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
              {submitting
                ? editing
                  ? "Guardando…"
                  : "Creando…"
                : editing
                  ? "Guardar cambios"
                  : "Crear evento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
