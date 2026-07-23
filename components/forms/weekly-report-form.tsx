"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ServiceType,
  TherapyStatus,
  EvaluationStatus,
  PatientType,
} from "@prisma/client";
import { AlertCircle, CalendarClock, Check, Users } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
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
  patientTypeLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

interface ActivePatient {
  id: string;
  fullName: string;
  reportUpdates?: {
    serviceType: ServiceType;
    therapyStatus: TherapyStatus | null;
    evaluationStatus: EvaluationStatus | null;
    patientType: PatientType | null;
  }[];
}

interface PatientRow {
  patientId: string;
  patientName: string;
  serviceType: ServiceType;
  status: string; // "" = falta elegir
  patientType: string; // "" = falta elegir
}

const DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
];

interface HourSlot { startTime: string; endTime: string; label: string }

const MORNING_SLOTS: HourSlot[] = [
  { startTime: "09:00", endTime: "10:00", label: "9:00 am" },
  { startTime: "10:00", endTime: "11:00", label: "10:00 am" },
  { startTime: "11:00", endTime: "12:00", label: "11:00 am" },
];
const NOON_SLOT: HourSlot = { startTime: "12:00", endTime: "13:00", label: "12:00 pm" };
const AFTERNOON_SLOTS: HourSlot[] = [
  { startTime: "14:30", endTime: "15:30", label: "2:30 pm" },
  { startTime: "15:30", endTime: "16:30", label: "3:30 pm" },
  { startTime: "16:30", endTime: "17:30", label: "4:30 pm" },
  { startTime: "17:30", endTime: "18:30", label: "5:30 pm" },
];

function daySlots(dayOfWeek: number): HourSlot[] {
  const morning = [...MORNING_SLOTS, NOON_SLOT];
  const afternoon = dayOfWeek === 5 ? [] : AFTERNOON_SLOTS;
  return [...morning, ...afternoon];
}

// All unique hour slots for the table rows
const ALL_SLOTS: HourSlot[] = [
  ...MORNING_SLOTS,
  NOON_SLOT,
  ...AFTERNOON_SLOTS,
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
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [availability, setAvailability] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Solo se muestran los estados de error de campos incompletos después de
  // un primer intento de envío, para no recibir al psicólogo con un
  // formulario en blanco lleno de rojo.
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    fetch("/api/patients?mine=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ActivePatient[]) => {
        setPatients(data);
        setActiveCount(String(data.length));
        // Una fila obligatoria por cada paciente activo; se precarga con su
        // último reporte cuando existe, o queda en blanco para completar.
        setRows(
          data.map((p): PatientRow => {
            const last = p.reportUpdates?.[0];
            if (!last) {
              return {
                patientId: p.id,
                patientName: p.fullName,
                serviceType: ServiceType.THERAPY,
                status: "",
                patientType: "",
              };
            }
            const status =
              (last.serviceType === ServiceType.EVALUATION
                ? last.evaluationStatus
                : last.therapyStatus) ?? "";
            return {
              patientId: p.id,
              patientName: p.fullName,
              serviceType: last.serviceType,
              status,
              patientType: last.patientType ?? "",
            };
          }),
        );
        setLoading(false);
      });
  }, []);

  const slotKey = (day: number, startTime: string) => `${day}|${startTime}`;
  const toggleSlot = (day: number, slot: HourSlot) => {
    setAvailability((prev) => {
      const next = new Set(prev);
      const k = slotKey(day, slot.startTime);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const availabilityPayload = useMemo(
    () =>
      [...availability].map((k) => {
        const [dayStr, startTime] = k.split("|");
        const day = Number(dayStr);
        const slot = daySlots(day).find((s) => s.startTime === startTime);
        return { dayOfWeek: day, startTime, endTime: slot?.endTime ?? startTime };
      }),
    [availability],
  );

  function updateRow(patientId: string, patch: Partial<PatientRow>) {
    setRows((prev) =>
      prev.map((r) => (r.patientId === patientId ? { ...r, ...patch } : r)),
    );
  }

  const incompleteRows = rows.filter((r) => r.status === "" || r.patientType === "");
  const availabilityMissing = availability.size === 0;
  const formIncomplete = incompleteRows.length > 0 || availabilityMissing;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formIncomplete) {
      setShowValidation(true);
      setServerError(null);
      return;
    }
    setSubmitting(true);
    setServerError(null);

    const patientUpdates = rows.map((r) => ({
      patientId: r.patientId,
      serviceType: r.serviceType,
      therapyStatus: r.serviceType !== ServiceType.EVALUATION ? r.status : null,
      evaluationStatus: r.serviceType === ServiceType.EVALUATION ? r.status : null,
      patientType: r.patientType,
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
          <div className="flex items-center justify-between">
            <Label htmlFor="activeCount">Pacientes activos *</Label>
            {patients.length > 0 && (
              <PopoverPrimitive.Root>
                <PopoverPrimitive.Trigger asChild>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Ver lista
                  </button>
                </PopoverPrimitive.Trigger>
                <PopoverPrimitive.Portal>
                  <PopoverPrimitive.Content
                    className="z-50 max-h-64 w-64 overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
                    sideOffset={4}
                    align="end"
                  >
                    <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                      Pacientes activos ({patients.length})
                    </p>
                    <ul className="space-y-0.5">
                      {patients.map((p) => (
                        <li key={p.id} className="rounded-sm px-1 py-0.5 text-sm">
                          {p.fullName}
                        </li>
                      ))}
                    </ul>
                  </PopoverPrimitive.Content>
                </PopoverPrimitive.Portal>
              </PopoverPrimitive.Root>
            )}
          </div>
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
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Label>Estado de mis pacientes *</Label>
        </div>
        {patients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes pacientes asignados.
          </p>
        ) : (
          <div className="space-y-3 rounded-md border p-3">
            {rows.map((r) => {
              const rowIncomplete =
                showValidation && (r.status === "" || r.patientType === "");
              return (
                <div
                  key={r.patientId}
                  className={cn(
                    "grid grid-cols-1 gap-2 border-b border-l-2 pb-3 pl-2 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_130px_1fr_150px] sm:items-center",
                    rowIncomplete ? "border-l-destructive" : "border-l-transparent",
                  )}
                >
                  <span
                    className="truncate text-sm font-medium"
                    title={r.patientName}
                  >
                    {r.patientName}
                  </span>
                  <Select
                    value={r.serviceType}
                    onValueChange={(v) =>
                      updateRow(r.patientId, {
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
                    value={r.status}
                    onValueChange={(v) => updateRow(r.patientId, { status: v })}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9",
                        rowIncomplete && r.status === "" && "border-destructive",
                      )}
                    >
                      <SelectValue placeholder="Elige un estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {r.serviceType === ServiceType.EVALUATION
                        ? Object.values(EvaluationStatus).map((s) => (
                            <SelectItem key={s} value={s}>
                              {evaluationStatusLabels[s]}
                            </SelectItem>
                          ))
                        : Object.values(TherapyStatus).map((s) => (
                            <SelectItem key={s} value={s}>
                              {therapyStatusLabels[s]}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={r.patientType}
                    onValueChange={(v) =>
                      updateRow(r.patientId, { patientType: v })
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9",
                        rowIncomplete && r.patientType === "" && "border-destructive",
                      )}
                    >
                      <SelectValue placeholder="Tipo de Px" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(PatientType).map((t) => (
                        <SelectItem key={t} value={t}>
                          {patientTypeLabels[t]}
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
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <Label>Horarios disponibles próxima semana *</Label>
        </div>
        <div
          className={cn(
            "overflow-x-auto rounded-md border",
            showValidation && availabilityMissing && "border-destructive",
          )}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left font-medium text-muted-foreground w-24">
                  Hora
                </th>
                {DAYS.map((d) => (
                  <th key={d.value} className="p-2 font-medium text-center">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_SLOTS.map((s) => (
                <tr key={s.startTime} className="border-b last:border-0">
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{s.label}</td>
                  {DAYS.map((d) => {
                    const isAvailableDay = daySlots(d.value).some(
                      (ds) => ds.startTime === s.startTime,
                    );
                    const active = availability.has(slotKey(d.value, s.startTime));
                    return (
                      <td key={d.value} className="p-2 text-center">
                        {isAvailableDay ? (
                          <button
                            type="button"
                            onClick={() => toggleSlot(d.value, s)}
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-accent",
                            )}
                            aria-pressed={active}
                            aria-label={`${d.label} ${s.label}`}
                          >
                            {active && <Check className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showValidation && availabilityMissing && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" /> Marca al menos un horario disponible.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {showValidation && incompleteRows.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Falta indicar estado y tipo de paciente en{" "}
          {incompleteRows.length} {incompleteRows.length === 1 ? "fila" : "filas"}.
        </p>
      )}
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Enviando…" : "Enviar reporte"}
      </Button>
    </form>
  );
}
