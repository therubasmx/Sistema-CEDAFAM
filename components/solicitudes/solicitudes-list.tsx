"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, User, MapPin, Clock, AlertTriangle } from "lucide-react";
import { AppointmentServiceType, AppointmentStatus, Room } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  appointmentServiceTypeLabels,
  appointmentStatusLabels,
  roomLabels,
} from "@/lib/labels";
import { formatMxDateTime } from "@/lib/utils";
import { ScheduleAppointmentForm } from "@/components/solicitudes/schedule-appointment-form";

interface RequestItem {
  id: string;
  scheduledAt: string;
  duration: number;
  serviceType: AppointmentServiceType;
  status: AppointmentStatus;
  room: Room | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  patient: { id: string; fullName: string };
  psychologist: { id: string; user: { name: string } };
}

const statusVariant: Record<"PENDING" | "REJECTED", BadgeProps["variant"]> = {
  PENDING: "warning",
  REJECTED: "destructive",
};

function roomText(room: Room | null): string {
  return room ? roomLabels[room] : "Sin preferencia";
}

export function SolicitudesList() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [mode, setMode] = useState<"view" | "reject" | "schedule">("view");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/appointments/requests");
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openRequest(r: RequestItem) {
    setSelected(r);
    setMode("view");
    setNote("");
    setError(null);
  }

  async function review(decision: "ACCEPT" | "REJECT") {
    if (!selected) return;
    if (decision === "REJECT" && !note.trim()) {
      setError("Escribe el motivo del rechazo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/appointments/${selected.id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        decision === "REJECT" ? { decision, note: note.trim() } : { decision },
      ),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo procesar la solicitud.");
      return;
    }
    toast({
      title: decision === "ACCEPT" ? "Solicitud aceptada" : "Solicitud rechazada",
      variant: "success",
    });
    if (decision === "ACCEPT") {
      // Aceptada → queda agendada, sale de este listado.
      setRequests((prev) => prev.filter((r) => r.id !== selected.id));
    } else {
      // Rechazada → sigue visible aquí hasta que el psicólogo la reenvíe.
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? { ...r, status: AppointmentStatus.REJECTED, rejectionReason: note.trim() }
            : r,
        ),
      );
    }
    setSelected(null);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando solicitudes…</p>;
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No hay solicitudes por revisar.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex flex-col justify-between gap-3 rounded-md border bg-card p-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold">{r.patient.fullName}</p>
                <Badge variant={statusVariant[r.status as "PENDING" | "REJECTED"]}>
                  {appointmentStatusLabels[r.status]}
                </Badge>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {r.psychologist.user.name}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {roomText(r.room)}
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {formatMxDateTime(r.scheduledAt)}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => openRequest(r)}>
              Ver solicitud
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && mode === "schedule" ? (
            <ScheduleAppointmentForm
              request={selected}
              onCancel={() => setMode("view")}
              onScheduled={() => {
                // Agendada → sale del listado (igual que al aceptar).
                setRequests((prev) => prev.filter((r) => r.id !== selected.id));
                setSelected(null);
              }}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Solicitud de cita</DialogTitle>
                <DialogDescription>
                  {selected?.status === AppointmentStatus.REJECTED
                    ? "Solicitud rechazada. Puedes aceptarla, agendarla directamente o rechazarla de nuevo."
                    : "Revisa los datos: acéptala, agéndala directamente o recházala."}
                </DialogDescription>
              </DialogHeader>

              {selected?.status === AppointmentStatus.REJECTED &&
                selected.rejectionReason && (
                  <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="font-medium text-destructive">
                        Motivo del rechazo
                      </p>
                      <p className="mt-0.5 text-foreground">
                        {selected.rejectionReason}
                      </p>
                    </div>
                  </div>
                )}

              {selected && (
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                  <dt className="font-medium text-muted-foreground">Paciente</dt>
                  <dd className="col-span-2">{selected.patient.fullName}</dd>

                  <dt className="font-medium text-muted-foreground">Psicólogo</dt>
                  <dd className="col-span-2">{selected.psychologist.user.name}</dd>

                  <dt className="font-medium text-muted-foreground">Fecha y hora</dt>
                  <dd className="col-span-2">
                    {formatMxDateTime(selected.scheduledAt)}
                  </dd>

                  <dt className="font-medium text-muted-foreground">Duración</dt>
                  <dd className="col-span-2">{selected.duration} min</dd>

                  <dt className="font-medium text-muted-foreground">Servicio</dt>
                  <dd className="col-span-2">
                    {appointmentServiceTypeLabels[selected.serviceType]}
                  </dd>

                  <dt className="font-medium text-muted-foreground">Consultorio</dt>
                  <dd className="col-span-2">{roomText(selected.room)}</dd>

                  {selected.notes && (
                    <>
                      <dt className="font-medium text-muted-foreground">Notas</dt>
                      <dd className="col-span-2 whitespace-pre-wrap">
                        {selected.notes}
                      </dd>
                    </>
                  )}
                </dl>
              )}

              {mode === "reject" && (
                <div className="space-y-2">
                  <Label htmlFor="reject-note">Motivo del rechazo *</Label>
                  <Textarea
                    id="reject-note"
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Explica al psicólogo por qué se rechaza para que proponga una nueva fecha…"
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                {mode === "reject" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => {
                        setMode("view");
                        setNote("");
                        setError(null);
                      }}
                    >
                      Volver
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={submitting}
                      onClick={() => review("REJECT")}
                    >
                      {submitting ? "Enviando…" : "Confirmar rechazo"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={submitting}
                      onClick={() => {
                        setMode("reject");
                        setError(null);
                      }}
                    >
                      Rechazar solicitud
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => review("ACCEPT")}
                    >
                      {submitting ? "Procesando…" : "Aceptar solicitud"}
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setMode("schedule");
                        setError(null);
                      }}
                    >
                      Agendar
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
