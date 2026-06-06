"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AppointmentServiceType,
  AppointmentStatus,
  Role,
} from "@prisma/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  appointmentServiceTypeLabels,
  appointmentStatusLabels,
} from "@/lib/labels";

export interface CalendarAppointment {
  id: string;
  patientId: string;
  scheduledAt: string;
  duration: number;
  serviceType: AppointmentServiceType;
  status: AppointmentStatus;
  notes: string | null;
  patient: { id: string; fullName: string };
  psychologist: { id: string; user: { name: string } };
}

interface Option {
  id: string;
  name: string;
}

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  role: Role;
  psychologistId: string | null;
  /** Editing an existing appointment, or null to create. */
  appointment?: CalendarAppointment | null;
  /** Pre-filled date (ISO) when creating from a day cell. */
  defaultDate?: string;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  onSaved,
  role,
  psychologistId,
  appointment,
  defaultDate,
}: AppointmentDialogProps) {
  const { toast } = useToast();
  const isEdit = !!appointment;
  const isPsychologist = role === Role.PSYCHOLOGIST;

  const [patients, setPatients] = useState<Option[]>([]);
  const [psychologists, setPsychologists] = useState<Option[]>([]);
  const [patientId, setPatientId] = useState("");
  const [psyId, setPsyId] = useState("");
  const [datetime, setDatetime] = useState("");
  const [duration, setDuration] = useState("60");
  const [serviceType, setServiceType] = useState<AppointmentServiceType>(
    AppointmentServiceType.THERAPY,
  );
  const [status, setStatus] = useState<AppointmentStatus>(
    AppointmentStatus.SCHEDULED,
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);

    // Load options.
    fetch("/api/patients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; fullName: string }[]) =>
        setPatients(data.map((p) => ({ id: p.id, name: p.fullName }))),
      );
    if (!isPsychologist) {
      fetch("/api/psychologists")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: { id: string; name: string }[]) => setPsychologists(data));
    }

    if (appointment) {
      setPatientId(appointment.patientId);
      setPsyId(appointment.psychologist.id);
      setDatetime(format(new Date(appointment.scheduledAt), "yyyy-MM-dd'T'HH:mm"));
      setDuration(String(appointment.duration));
      setServiceType(appointment.serviceType);
      setStatus(appointment.status);
      setNotes(appointment.notes ?? "");
    } else {
      setPatientId("");
      setPsyId(isPsychologist ? (psychologistId ?? "") : "");
      setDatetime(
        defaultDate
          ? format(new Date(defaultDate), "yyyy-MM-dd'T'HH:mm")
          : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      );
      setDuration("60");
      setServiceType(AppointmentServiceType.THERAPY);
      setStatus(AppointmentStatus.SCHEDULED);
      setNotes("");
    }
  }, [open, appointment, defaultDate, isPsychologist, psychologistId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const url = isEdit ? `/api/appointments/${appointment!.id}` : "/api/appointments";
    const method = isEdit ? "PUT" : "POST";
    const payload = isEdit
      ? {
          scheduledAt: new Date(datetime).toISOString(),
          duration: Number(duration),
          serviceType,
          status,
          notes,
        }
      : {
          patientId,
          psychologistId: isPsychologist ? psychologistId : psyId,
          scheduledAt: new Date(datetime).toISOString(),
          duration: Number(duration),
          serviceType,
          notes,
        };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar la cita.");
      return;
    }
    toast({ title: isEdit ? "Cita actualizada" : "Cita creada", variant: "success" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cita" : "Nueva cita"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? appointment?.patient.fullName
              : "Agenda una cita para un paciente."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isEdit && !isPsychologist && (
            <div className="space-y-2">
              <Label>Psicólogo *</Label>
              <Select value={psyId} onValueChange={setPsyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un psicólogo" />
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
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="datetime">Fecha y hora *</Label>
              <Input
                id="datetime"
                type="datetime-local"
                required
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duración (min) *</Label>
              <Input
                id="duration"
                type="number"
                min={15}
                step={15}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de servicio</Label>
              <Select
                value={serviceType}
                onValueChange={(v) => setServiceType(v as AppointmentServiceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(AppointmentServiceType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {appointmentServiceTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as AppointmentStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(AppointmentStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {appointmentStatusLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || (!isEdit && !patientId)}>
              {submitting ? "Guardando…" : isEdit ? "Guardar" : "Crear cita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
