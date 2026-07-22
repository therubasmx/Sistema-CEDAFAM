"use client";

import { useEffect, useState } from "react";
import { AppointmentServiceType, Room } from "@prisma/client";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { DateTimeSelector, type TimeSlot } from "@/components/ui/date-time-selector";
import { appointmentServiceTypeLabels } from "@/lib/labels";
import { formatMxDateInput, mxSlotToISO } from "@/lib/utils";

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
  const [duration, setDuration] = useState(String(request.duration));
  const [dateTime, setDateTime] = useState({
    date: (() => {
      const proposed = formatMxDateInput(request.scheduledAt);
      return proposed < today ? today : proposed;
    })(),
    time: "",
  });
  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const durationNum = Number(duration);
    if (!dateTime.date || !durationNum || durationNum <= 0) return;
    setLoadingSlots(true);
    setError(null);
    const params = new URLSearchParams({
      psychologistId: request.psychologist.id,
      date: dateTime.date,
      duration: String(durationNum),
      excludeId: request.id,
    });
    let cancelled = false;
    fetch(`/api/appointments/available-slots?${params}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots: TimeSlot[] }) => {
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
  }, [dateTime.date, duration, request.id, request.psychologist.id]);

  async function schedule() {
    if (!dateTime.time) {
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
        scheduledAt: mxSlotToISO(dateTime.date, dateTime.time),
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Duración (min) *</label>
          <input
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-9 w-full max-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <DateTimeSelector
          value={dateTime}
          onChange={setDateTime}
          slots={slots}
          loading={loadingSlots}
          minDate={today}
          error={error}
        />
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
        <Button type="button" disabled={submitting || !dateTime.time} onClick={schedule}>
          {submitting ? "Agendando…" : "Agendar cita"}
        </Button>
      </DialogFooter>
    </>
  );
}
