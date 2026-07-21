"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addHours, parse } from "date-fns";
import { es } from "date-fns/locale";
import { BookOpen, CalendarPlus, Trash2 } from "lucide-react";
import { EventKind, EventScope } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { ModuleEvent } from "@/components/events/event-module-view";
import { cn } from "@/lib/utils";

interface Psychologist {
  id: string;
  name: string;
}

/** Suma una hora a "HH:mm" para proponer la hora de fin. */
function plusOneHour(time: string): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return time;
  return format(addHours(parse(time, "HH:mm", new Date()), 1), "HH:mm");
}

function presenterName(e: ModuleEvent): string {
  return e.attendees?.[0]?.psychologist.user.name ?? "—";
}

/**
 * Estudios de caso de Coordinación Desarrollo Profesional: un psicólogo
 * expone un caso ante todo el equipo. Es un evento de alcance ALL como
 * cualquier otro — se agenda en el calendario de todos y bloquea su agenda
 * mientras dura —, sólo que además guarda quién presenta como único invitado,
 * de donde sale el título automático "Estudio de Caso — {nombre}".
 */
export function CaseStudyView() {
  const { toast } = useToast();
  const [events, setEvents] = useState<ModuleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar/events?kind=${EventKind.CASE_STUDY}`);
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    [events],
  );

  async function remove(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo eliminar",
        description: d.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Estudio de caso eliminado", variant: "success" });
    load();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Estudios de caso</h2>
          <p className="text-sm text-muted-foreground">
            Se agendan en el calendario de todo el equipo y bloquean la agenda
            de todos mientras duran.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Nuevo Estudio de Caso
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card p-8 text-center">
          <p className="font-medium">Todavía no hay estudios de caso agendados</p>
          <p className="text-sm text-muted-foreground">
            Crea el primero con el botón de arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((e) => {
            const isPast = new Date(e.endAt).getTime() < Date.now();
            return (
              <Card key={e.id} className={cn(isPast && "opacity-70")}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-start gap-3">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{presenterName(e)}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(e.startAt), "EEEE d 'de' MMMM yyyy, HH:mm", {
                          locale: es,
                        })}
                        {" – "}
                        {format(new Date(e.endAt), "HH:mm")}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Eliminar"
                    disabled={deleting === e.id}
                    onClick={() => remove(e.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CaseStudyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />
    </section>
  );
}

function CaseStudyFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [presenterId, setPresenterId] = useState("");
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDay(format(new Date(), "yyyy-MM-dd"));
    setStartTime("09:00");
    setEndTime("10:00");
    setPresenterId("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/psychologists")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPsychologists);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // El título real lo genera el servidor a partir del presentador.
        title: "Estudio de Caso",
        startAt: new Date(`${day}T${startTime}`).toISOString(),
        endAt: new Date(`${day}T${endTime}`).toISOString(),
        kind: EventKind.CASE_STUDY,
        scope: EventScope.ALL,
        attendeeIds: [presenterId],
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo agendar el estudio de caso.");
      return;
    }

    toast({
      title: "Estudio de caso agendado",
      description: "Se notificó a todo el equipo y quedó bloqueado en su agenda.",
      variant: "success",
    });
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo Estudio de Caso</DialogTitle>
          <DialogDescription>
            Se agenda en el calendario de todo el equipo y bloquea la agenda
            de todos mientras dura.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Psicólogo que presenta *</Label>
            <Select value={presenterId} onValueChange={setPresenterId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona a quién" />
              </SelectTrigger>
              <SelectContent>
                {psychologists.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cs-day">Fecha *</Label>
            <Input
              id="cs-day"
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cs-start">Hora *</Label>
              <Input
                id="cs-start"
                type="time"
                required
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  if (e.target.value >= endTime) {
                    setEndTime(plusOneHour(e.target.value));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cs-end">Termina *</Label>
              <Input
                id="cs-end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
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
            <Button type="submit" disabled={submitting || !presenterId}>
              {submitting ? "Agendando…" : "Agendar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
