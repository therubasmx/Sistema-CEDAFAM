"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Search, AlertTriangle } from "lucide-react";
import {
  AppointmentServiceType,
  AppointmentStatus,
  Role,
  Room,
  RoomBookingStatus,
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
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
  roomLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface CalendarAppointment {
  id: string;
  patientId: string;
  scheduledAt: string;
  duration: number;
  serviceType: AppointmentServiceType;
  status: AppointmentStatus;
  room: Room | null;
  roomStatus: RoomBookingStatus | null;
  rejectionReason: string | null;
  notes: string | null;
  patient: { id: string; fullName: string };
  psychologist: { id: string; user: { name: string } };
}

/** Valor centinela para "sin preferencia" de consultorio (Radix Select no admite ""). */
const NO_ROOM = "NONE";

/**
 * Consultorios que un psicólogo puede pedir como preferencia al crear una cita:
 * los espacios especializados de mayor demanda, que ameritan solicitarse en
 * específico. El resto de los 7 consultorios los asigna la Contadora desde el
 * tablero de Consultorios; "Sin preferencia" deja toda la asignación en sus
 * manos. Lista explícita para que agregar consultorios nuevos al enum no los
 * cuele en este selector.
 */
const PREFERENCE_ROOMS: Room[] = [
  Room.GESELL,
  Room.LUDOTECA,
  Room.OFFICE_ANTONIO,
];

/** Estados editables a mano en una cita ya confirmada (asistencia). */
const EDITABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ATTENDED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.CANCELLED,
];

const statusVariant: Record<AppointmentStatus, BadgeProps["variant"]> = {
  PENDING: "warning",
  SCHEDULED: "default",
  ATTENDED: "success",
  NO_SHOW: "destructive",
  CANCELLED: "secondary",
  REJECTED: "destructive",
};

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

  // Categoría de la solicitud/cita que se está editando.
  const isPending = appointment?.status === AppointmentStatus.PENDING;
  const isRejected = appointment?.status === AppointmentStatus.REJECTED;
  const isConfirmed = isEdit && !isPending && !isRejected;

  const [patients, setPatients] = useState<Option[]>([]);
  const [psychologists, setPsychologists] = useState<Option[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [psyId, setPsyId] = useState("");
  const [datetime, setDatetime] = useState("");
  const [duration, setDuration] = useState("60");
  const [serviceType, setServiceType] = useState<AppointmentServiceType>(
    AppointmentServiceType.THERAPY,
  );
  const [status, setStatus] = useState<AppointmentStatus>(
    AppointmentStatus.SCHEDULED,
  );
  const [room, setRoom] = useState<string>(NO_ROOM);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePsyId = isPsychologist ? (psychologistId ?? "") : psyId;

  const selectedPatientName =
    patients.find((p) => p.id === patientId)?.name ?? "";
  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    const list = q
      ? patients.filter((p) => p.name.toLowerCase().includes(q))
      : patients;
    return list.slice(0, 50);
  }, [patients, patientQuery]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPatientOpen(false);
    setPatientQuery("");

    // Load options.
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
      setRoom(appointment.room ?? NO_ROOM);
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
      setRoom(NO_ROOM);
      setNotes("");
    }
  }, [open, appointment, defaultDate, isPsychologist, psychologistId]);

  // Scope the patient list to whichever psychologist the appointment is
  // for, so Coordinación/Jefe only see that psychologist's own patients
  // instead of every patient in the practice.
  useEffect(() => {
    if (!open || isEdit) return;
    if (!effectivePsyId) {
      setPatients([]);
      return;
    }
    fetch(`/api/patients?psychologistId=${effectivePsyId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; fullName: string }[]) =>
        setPatients(data.map((p) => ({ id: p.id, name: p.fullName }))),
      );
  }, [open, isEdit, effectivePsyId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const url = isEdit ? `/api/appointments/${appointment!.id}` : "/api/appointments";
    const method = isEdit ? "PUT" : "POST";
    const roomValue = room === NO_ROOM ? null : (room as Room);

    let payload: Record<string, unknown>;
    if (!isEdit) {
      payload = {
        patientId,
        psychologistId: isPsychologist ? psychologistId : psyId,
        scheduledAt: new Date(datetime).toISOString(),
        duration: Number(duration),
        serviceType,
        room: roomValue,
        notes,
      };
    } else {
      payload = {
        scheduledAt: new Date(datetime).toISOString(),
        duration: Number(duration),
        serviceType,
        room: roomValue,
        notes,
      };
      if (isRejected) {
        // Reenviar la solicitud: vuelve a PENDING.
        payload.resend = true;
      } else if (isConfirmed) {
        payload.status = status;
      }
      // PENDING: sin status ni resend → la solicitud sigue pendiente.
    }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar la solicitud.");
      return;
    }
    toast({
      title: !isEdit
        ? "Solicitud enviada"
        : isRejected
          ? "Solicitud reenviada"
          : isPending
            ? "Solicitud actualizada"
            : "Cita actualizada",
      variant: "success",
    });
    onSaved();
    onOpenChange(false);
  }

  const title = !isEdit
    ? "Nueva solicitud de cita"
    : isPending
      ? "Solicitud pendiente"
      : isRejected
        ? "Solicitud rechazada"
        : "Editar cita";

  const submitLabel = !isEdit
    ? "Enviar solicitud"
    : isRejected
      ? "Reenviar solicitud"
      : "Guardar cambios";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {isEdit && appointment && (
              <Badge variant={statusVariant[appointment.status]}>
                {appointmentStatusLabels[appointment.status]}
              </Badge>
            )}
          </div>
          <DialogDescription>
            {isEdit
              ? appointment?.patient.fullName
              : "Propuesta sujeta a cambios según la disponibilidad del paciente y de los consultorios."}
          </DialogDescription>
        </DialogHeader>

        {/* Motivo del rechazo — el psicólogo debe proponer nueva fecha y reenviar. */}
        {isRejected && appointment?.rejectionReason && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Solicitud rechazada por la Contadora
              </p>
              <p className="mt-0.5 text-foreground">{appointment.rejectionReason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Propón una nueva fecha y hora y reenvía la solicitud.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {!isEdit && !isPsychologist && (
            <div className="space-y-2">
              <Label>Psicólogo *</Label>
              <Select
                value={psyId}
                onValueChange={(v) => {
                  setPsyId(v);
                  setPatientId("");
                  setPatientQuery("");
                }}
              >
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

          {!isEdit && (
            <div className="space-y-2">
              <Label>Paciente *</Label>
              <div className="relative">
                <button
                  type="button"
                  disabled={!effectivePsyId}
                  onClick={() => setPatientOpen((o) => !o)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className={cn(!selectedPatientName && "text-muted-foreground")}>
                    {selectedPatientName ||
                      (effectivePsyId
                        ? "Selecciona un paciente"
                        : "Selecciona un psicólogo primero")}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </button>
                {patientOpen && (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setPatientOpen(false)}
                    />
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                      <div className="relative mb-1">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                        <Input
                          autoFocus
                          value={patientQuery}
                          onChange={(e) => setPatientQuery(e.target.value)}
                          placeholder="Buscar por nombre…"
                          className="h-9 pl-8"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {filteredPatients.length === 0 ? (
                          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                            Sin resultados
                          </p>
                        ) : (
                          filteredPatients.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setPatientId(p.id);
                                setPatientOpen(false);
                                setPatientQuery("");
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                            >
                              <span className="truncate">{p.name}</span>
                              {p.id === patientId && (
                                <Check className="h-4 w-4 shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
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
            {isConfirmed && (
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
                    {EDITABLE_STATUSES.map((s) => (
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
            <Label>Consultorio</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger>
                <SelectValue placeholder="Sin preferencia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>Sin preferencia</SelectItem>
                {Object.values(Room)
                  .filter(
                    (r) => PREFERENCE_ROOMS.includes(r) || r === appointment?.room,
                  )
                  .map((r) => (
                    <SelectItem key={r} value={r}>
                      {roomLabels[r]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {!isConfirmed && (
              <p className="text-xs text-muted-foreground">
                El consultorio es solo una preferencia; la Contadora confirma la
                disponibilidad al aprobar la solicitud.
              </p>
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
              {submitting ? "Guardando…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
