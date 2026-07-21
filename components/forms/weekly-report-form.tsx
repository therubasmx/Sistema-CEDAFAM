"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ServiceType,
  TherapyStatus,
  EvaluationStatus,
  PatientType,
} from "@prisma/client";
import { ChevronDown, Plus, Search, Trash2 } from "lucide-react";
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
  rowId: string;
  patientId: string; // "" = aún no seleccionado
  serviceType: ServiceType;
  status: string; // therapy or evaluation enum value, "" = sin cambio
  patientType: string; // PatientType enum value, "" = sin cambio
  // "returning" = precargada con el último reporte del paciente; "new" =
  // agregada a mano con "Añadir paciente". Determina de qué lista de
  // pacientes puede elegir el combobox de esa fila.
  pool: "returning" | "new";
}

let rowCounter = 0;
const newRow = (pool: PatientRow["pool"]): PatientRow => ({
  rowId: `row-${rowCounter++}`,
  patientId: "",
  serviceType: ServiceType.THERAPY,
  status: "",
  patientType: "",
  pool,
});

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
const FRIDAY_EXTRA: HourSlot = { startTime: "12:00", endTime: "13:00", label: "12:00 pm" };
const AFTERNOON_SLOTS: HourSlot[] = [
  { startTime: "14:30", endTime: "15:30", label: "2:30 pm" },
  { startTime: "15:30", endTime: "16:30", label: "3:30 pm" },
  { startTime: "16:30", endTime: "17:30", label: "4:30 pm" },
  { startTime: "17:30", endTime: "18:30", label: "5:30 pm" },
];

function daySlots(dayOfWeek: number): HourSlot[] {
  return dayOfWeek === 5
    ? [...MORNING_SLOTS, FRIDAY_EXTRA]
    : [...MORNING_SLOTS, ...AFTERNOON_SLOTS];
}

// All unique hour slots for the table rows
const ALL_SLOTS: HourSlot[] = [
  ...MORNING_SLOTS,
  FRIDAY_EXTRA,
  ...AFTERNOON_SLOTS,
];

function PatientCombobox({
  options,
  value,
  onValueChange,
}: {
  options: ActivePatient[];
  value: string;
  onValueChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((p) =>
    p.fullName.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = options.find((p) => p.id === value);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? selected.fullName : "Selecciona paciente"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-[--radix-popover-trigger-width] rounded-md border bg-popover text-popover-foreground shadow-md"
          sideOffset={4}
          align="start"
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Buscar paciente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Sin resultados.
              </p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cn(
                    "flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left",
                    p.id === value && "bg-accent font-medium",
                  )}
                  onClick={() => {
                    onValueChange(p.id);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  {p.fullName}
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

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

  useEffect(() => {
    fetch("/api/patients?mine=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ActivePatient[]) => {
        setPatients(data);
        setActiveCount(String(data.length));
        // Pre-guardado: una fila por cada paciente que ya tiene un reporte
        // previo, con lo último reportado. El psicólogo puede modificarla o
        // dejarla tal cual al enviar.
        const prefilled = data
          .filter((p) => (p.reportUpdates?.length ?? 0) > 0)
          .map((p): PatientRow => {
            const last = p.reportUpdates![0];
            const status =
              (last.serviceType === ServiceType.EVALUATION
                ? last.evaluationStatus
                : last.therapyStatus) ?? "";
            return {
              rowId: `row-${rowCounter++}`,
              patientId: p.id,
              serviceType: last.serviceType,
              status,
              patientType: last.patientType ?? "",
              pool: "returning",
            };
          });
        setRows(prefilled);
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

  function updateRow(rowId: string, patch: Partial<PatientRow>) {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);

    const patientUpdates = rows
      .filter(
        (r) => r.patientId !== "" && (r.status !== "" || r.patientType !== ""),
      )
      .map((r) => ({
        patientId: r.patientId,
        serviceType: r.serviceType,
        therapyStatus:
          r.serviceType !== ServiceType.EVALUATION && r.status ? r.status : null,
        evaluationStatus:
          r.serviceType === ServiceType.EVALUATION && r.status ? r.status : null,
        patientType: r.patientType || null,
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

  // Pacientes con historial (ya reportados alguna vez) vs. nuevos (nunca
  // reportados). "Añadir paciente" solo ofrece estos últimos: los que ya
  // tienen historial se precargan solos al abrir el formulario.
  const returningPatients = patients.filter((p) => (p.reportUpdates?.length ?? 0) > 0);
  const newPatients = patients.filter((p) => (p.reportUpdates?.length ?? 0) === 0);
  const usedPatientIds = new Set(rows.map((r) => r.patientId));
  const addableNewPatients = newPatients.filter((p) => !usedPatientIds.has(p.id));

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
        <Label>Estado de mis pacientes</Label>
        {patients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes pacientes asignados.
          </p>
        ) : (
          <div className="space-y-3 rounded-md border p-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no has añadido pacientes a este reporte.
              </p>
            ) : (
              rows.map((r) => {
                // Pacientes disponibles: no seleccionados en otras filas, y
                // del mismo pool que esta fila (con historial o nuevos).
                const taken = new Set(
                  rows.filter((o) => o.rowId !== r.rowId).map((o) => o.patientId),
                );
                const pool = r.pool === "returning" ? returningPatients : newPatients;
                const options = pool.filter(
                  (p) => !taken.has(p.id) || p.id === r.patientId,
                );
                return (
                  <div
                    key={r.rowId}
                    className="grid grid-cols-1 gap-2 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_130px_1fr_150px_auto] sm:items-center"
                  >
                    <PatientCombobox
                      options={options}
                      value={r.patientId}
                      onValueChange={(v) => updateRow(r.rowId, { patientId: v })}
                    />
                    <Select
                      value={r.serviceType}
                      onValueChange={(v) =>
                        updateRow(r.rowId, {
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
                      onValueChange={(v) => updateRow(r.rowId, { status: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Sin cambio" />
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
                        updateRow(r.rowId, { patientType: v })
                      }
                    >
                      <SelectTrigger className="h-9">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(r.rowId)}
                      aria-label="Quitar paciente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, newRow("new")])}
              disabled={addableNewPatients.length === 0}
            >
              <Plus className="mr-1 h-4 w-4" />
              Añadir paciente
            </Button>
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
                              "h-7 w-7 rounded-md border transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-accent",
                            )}
                            aria-pressed={active}
                          >
                            {active ? "✓" : ""}
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
