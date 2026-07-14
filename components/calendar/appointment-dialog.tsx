"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Search } from "lucide-react";
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
  roomBookingStatusLabels,
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
  notes: string | null;
  patient: { id: string; fullName: string };
  psychologist: { id: string; user: { name: string } };
}

/** Valor centinela para "sin consultorio" (Radix Select no admite ""). */
const NO_ROOM = "NONE";

const roomStatusVariant: Record<RoomBookingStatus, BadgeProps["variant"]> = {
  PENDING: "secondary",
  APPROVED: "success",
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
  const canAuthorize = role === Role.ADMIN || role === Role.COORDINATOR;

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const url = isEdit ? `/api/appointments/${appointment!.id}` : "/api/appointments";
    const method = isEdit ? "PUT" : "POST";
    const roomValue = room === NO_ROOM ? null : (room as Room);
    const payload = isEdit
      ? {
          scheduledAt: new Date(datetime).toISOString(),
          duration: Number(duration),
          serviceType,
          status,
          room: roomValue,
          notes,
        }
      : {
          patientId,
          psychologistId: isPsychologist ? psychologistId : psyId,
          scheduledAt: new Date(datetime).toISOString(),
          duration: Number(duration),
          serviceType,
          room: roomValue,
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

  async function authorizeRoom(decision: RoomBookingStatus) {
    if (!appointment) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(
      `/api/appointments/${appointment.id}/room-authorization`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo procesar la autorización.");
      return;
    }
    toast({
      title:
        decision === RoomBookingStatus.APPROVED
          ? "Consultorio autorizado"
          : "Consultorio rechazado",
      variant: "success",
    });
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPatientOpen((o) => !o)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span className={cn(!selectedPatientName && "text-muted-foreground")}>
                    {selectedPatientName || "Selecciona un paciente"}
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
            <Label>Consultorio</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger>
                <SelectValue placeholder="Sin consultorio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>Sin consultorio</SelectItem>
                {Object.values(Room).map((r) => (
                  <SelectItem key={r} value={r}>
                    {roomLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isPsychologist && room !== NO_ROOM && (
              <p className="text-xs text-muted-foreground">
                Requiere autorización de coordinación. La cita se apartará el
                consultorio mientras se autoriza.
              </p>
            )}
          </div>

          {/* Estado de autorización del consultorio (al editar). */}
          {isEdit && appointment?.room && appointment.roomStatus && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3">
              <span className="text-sm">
                {roomLabels[appointment.room]}:
              </span>
              <Badge variant={roomStatusVariant[appointment.roomStatus]}>
                {roomBookingStatusLabels[appointment.roomStatus]}
              </Badge>
              {canAuthorize &&
                appointment.roomStatus === RoomBookingStatus.PENDING && (
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => authorizeRoom(RoomBookingStatus.REJECTED)}
                    >
                      Rechazar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={submitting}
                      onClick={() => authorizeRoom(RoomBookingStatus.APPROVED)}
                    >
                      Autorizar
                    </Button>
                  </div>
                )}
            </div>
          )}

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
