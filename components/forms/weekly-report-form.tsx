"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ServiceType,
  TherapyStatus,
  EvaluationStatus,
  TimeSlot,
} from "@prisma/client";
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
  serviceTypeLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

interface ActivePatient {
  id: string;
  fullName: string;
}

interface PatientUpdateState {
  serviceType: ServiceType;
  status: string; // therapy or evaluation enum value, "" = sin cambio
}

const DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
];

const SLOTS: { value: TimeSlot; label: string }[] = [
  { value: TimeSlot.MORNING, label: "Matutino" },
  { value: TimeSlot.AFTERNOON, label: "Vespertino" },
];

interface WeeklyReportFormProps {
  weekLabel: string;
  onSuccess?: () => void;
}

export function WeeklyReportForm({ weekLabel, onSuccess }: WeeklyReportFormProps) {
  const { toast } = useToast();
  const [patients, setPatients] = useState<ActivePatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("");
  const [activeCount, setActiveCount] = useState("");
  const [notes, setNotes] = useState("");
  const [updates, setUpdates] = useState<Record<string, PatientUpdateState>>({});
  const [availability, setAvailability] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ActivePatient[]) => {
        setPatients(data);
        setActiveCount(String(data.length));
        setLoading(false);
      });
  }, []);

  const slotKey = (day: number, slot: TimeSlot) => `${day}-${slot}`;
  const toggleSlot = (day: number, slot: TimeSlot) => {
    setAvailability((prev) => {
      const next = new Set(prev);
      const k = slotKey(day, slot);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const availabilityPayload = useMemo(
    () =>
      [...availability].map((k) => {
        const [day, slot] = k.split("-");
        return { dayOfWeek: Number(day), slot: slot as TimeSlot };
      }),
    [availability],
  );

  function setUpdate(patientId: string, patch: Partial<PatientUpdateState>) {
    setUpdates((prev) => {
      const current = prev[patientId] ?? {
        serviceType: ServiceType.THERAPY,
        status: "",
      };
      return { ...prev, [patientId]: { ...current, ...patch } };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);

    const patientUpdates = Object.entries(updates)
      .filter(([, u]) => u.status !== "")
      .map(([patientId, u]) => ({
        patientId,
        serviceType: u.serviceType,
        therapyStatus:
          u.serviceType === ServiceType.THERAPY ? u.status : null,
        evaluationStatus:
          u.serviceType === ServiceType.EVALUATION ? u.status : null,
      }));

    const res = await fetch("/api/weekly-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hoursOfAttention: hours === "" ? 0 : Number(hours),
        activePatientCount: activeCount === "" ? 0 : Number(activeCount),
        notes,
        patientUpdates,
        availability: availabilityPayload,
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setServerError(data.error ?? "No se pudo enviar el reporte.");
      return;
    }
    toast({ title: "Reporte enviado", variant: "success" });
    onSuccess?.();
  }

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Reporte de la <span className="font-medium">{weekLabel}</span>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hours">Horas de atención *</Label>
          <Input
            id="hours"
            type="number"
            min={0}
            required
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="activeCount">Pacientes activos *</Label>
          <Input
            id="activeCount"
            type="number"
            min={0}
            required
            value={activeCount}
            onChange={(e) => setActiveCount(e.target.value)}
          />
        </div>
      </div>

      {/* Estado por paciente */}
      <div className="space-y-2">
        <Label>Estado de mis pacientes</Label>
        {patients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes pacientes asignados.
          </p>
        ) : (
          <div className="space-y-2 rounded-md border p-3">
            {patients.map((p) => {
              const u = updates[p.id] ?? {
                serviceType: ServiceType.THERAPY,
                status: "",
              };
              return (
                <div
                  key={p.id}
                  className="grid grid-cols-1 gap-2 border-b pb-2 last:border-0 last:pb-0 sm:grid-cols-[1fr_140px_1fr] sm:items-center"
                >
                  <span className="text-sm font-medium">{p.fullName}</span>
                  <Select
                    value={u.serviceType}
                    onValueChange={(v) =>
                      setUpdate(p.id, {
                        serviceType: v as ServiceType,
                        status: "",
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ServiceType).map((t) => (
                        <SelectItem key={t} value={t}>
                          {serviceTypeLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={u.status}
                    onValueChange={(v) => setUpdate(p.id, { status: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sin cambio" />
                    </SelectTrigger>
                    <SelectContent>
                      {u.serviceType === ServiceType.THERAPY
                        ? Object.values(TherapyStatus).map((s) => (
                            <SelectItem key={s} value={s}>
                              {therapyStatusLabels[s]}
                            </SelectItem>
                          ))
                        : Object.values(EvaluationStatus).map((s) => (
                            <SelectItem key={s} value={s}>
                              {evaluationStatusLabels[s]}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disponibilidad */}
      <div className="space-y-2">
        <Label>Horarios disponibles próxima semana</Label>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left font-medium text-muted-foreground">
                  Horario
                </th>
                {DAYS.map((d) => (
                  <th key={d.value} className="p-2 font-medium">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((s) => (
                <tr key={s.value} className="border-b last:border-0">
                  <td className="p-2 text-muted-foreground">{s.label}</td>
                  {DAYS.map((d) => {
                    const active = availability.has(slotKey(d.value, s.value));
                    return (
                      <td key={d.value} className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSlot(d.value, s.value)}
                          className={cn(
                            "h-7 w-7 rounded-md border transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                          aria-pressed={active}
                        >
                          {active ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar reporte"}
      </Button>
    </form>
  );
}
