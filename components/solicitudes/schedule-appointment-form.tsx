"use client";

import { useEffect, useState } from "react";
import { AppointmentServiceType, Room } from "@prisma/client";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { appointmentServiceTypeLabels } from "@/lib/labels";
import { cn, formatMxDateInput, mxSlotToISO } from "@/lib/utils";

/** Subconjunto de la solicitud que el formulario necesita para agendar. */
interface ScheduleRequest {
  id: string;
  scheduledAt: string;
  duration: number;
  serviceType: AppointmentServiceType;
  room: Room | null;
  patient: { fullName: string };
  psychologist: { id: string; user: { name: string } };
}

type SlotReason = "PAST" | "EVENT" | "TAKEN" | "FULL";

interface Slot {
  startTime: string;
  label: string;
  available: boolean;
  reason: SlotReason | null;
}

const REASON_TEXT: Record<SlotReason, string> = {
  PAST: "Ya pasó",
  EVENT: "Evento",
  TAKEN: "Ocupado",
  FULL: "Sin consultorio",
};

interface Props {
  request: ScheduleRequest;
  onCancel: () => void;
  onScheduled: () => void;
}

/**
 * Formulario con el que la Contadora agenda directamente al paciente de una
 * solicitud. En lugar de un campo libre de fecha/hora, muestra los horarios que
 * el psicólogo declaró disponibles para el día elegido y solo permite elegir
 * uno válido; el backend revalida contra la disponibilidad al confirmar.
 */
export function ScheduleAppointmentForm({ request, onCancel, onScheduled }: Props) {
  const { toast } = useToast();
  const today = formatMxDateInput(new Date());
  const [dateStr, setDateStr] = useState(() => {
    const proposed = formatMxDateInput(request.scheduledAt);
    return proposed < today ? today : proposed;
  });
  const [duration, setDuration] = useState(String(request.duration));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const durationNum = Number(duration);
    if (!dateStr || !durationNum || durationNum <= 0) return;
    setLoadingSlots(true);
    setSelected("");
    setError(null);
    const params = new URLSearchParams({
      psychologistId: request.psychologist.id,
      date: dateStr,
      duration: String(durationNum),
      excludeId: request.id,
    });
    let cancelled = false;
    fetch(`/api/appointments/available-slots?${params}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots: Slot[] }) => {
        if (!cancelled) setSlots(d.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr, duration, request.id, request.psychologist.id]);

  async function schedule() {
    if (!selected) {
      setError("Selecciona un horario disponible.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/appointments/${request.id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "SCHEDULE",
        scheduledAt: mxSlotToISO(dateStr, selected),
        duration: Number(duration),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo agendar la cita.");
      return;
    }
    toast({ title: "Cita agendada", variant: "success" });
    onScheduled();
  }

  const hasSlots = slots !== null && slots.length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agendar cita</DialogTitle>
        <DialogDescription>
          Elige un día y uno de los horarios disponibles de{" "}
          {request.psychologist.user.name}.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
          <dt className="font-medium text-muted-foreground">Paciente</dt>
          <dd className="col-span-2">{request.patient.fullName}</dd>
          <dt className="font-medium text-muted-foreground">Psicólogo</dt>
          <dd className="col-span-2">{request.psychologist.user.name}</dd>
          <dt className="font-medium text-muted-foreground">Servicio</dt>
          <dd className="col-span-2">
            {appointmentServiceTypeLabels[request.serviceType]}
          </dd>
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="schedule-date">Día *</Label>
            <Input
              id="schedule-date"
              type="date"
              min={today}
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-duration">Duración (min) *</Label>
            <Input
              id="schedule-duration"
              type="number"
              min={15}
              step={15}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Horarios disponibles</Label>
          {loadingSlots ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando horarios…
            </p>
          ) : !hasSlots ? (
            <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                El psicólogo no tiene disponibilidad registrada ese día. Elige
                otro día.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots!.map((s) => (
                <button
                  key={s.startTime}
                  type="button"
                  disabled={!s.available}
                  onClick={() => setSelected(s.startTime)}
                  className={cn(
                    "flex flex-col items-center rounded-md border px-2 py-2 text-sm transition",
                    s.available
                      ? selected === s.startTime
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:border-primary hover:bg-accent"
                      : "cursor-not-allowed border-border/40 text-muted-foreground/50",
                  )}
                >
                  <span className="font-medium">{s.label}</span>
                  {!s.available && s.reason && (
                    <span className="text-xs">{REASON_TEXT[s.reason]}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onCancel}
        >
          Volver
        </Button>
        <Button type="button" disabled={submitting || !selected} onClick={schedule}>
          {submitting ? "Agendando…" : "Agendar cita"}
        </Button>
      </DialogFooter>
    </>
  );
}
