"use client";

import { useEffect, useState } from "react";
import { LeaveProgram, LeaveUnit, Speciality } from "@prisma/client";
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
import { CalendarDayPicker } from "@/components/ui/calendar-day-picker";
import {
  leaveProgramLabels,
  leaveUnitLabels,
  specialityLabels,
} from "@/lib/labels";
import { formatMxDateInput } from "@/lib/utils";

export interface EditableLeave {
  id: string;
  area: Speciality;
  program: LeaveProgram;
  unit: LeaveUnit;
  quantity: number;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  psychologist: { user: { name: string } };
}

interface Props {
  leave: EditableLeave | null;
  onClose: () => void;
  /** `clashingAppointments` viene solo si la solicitud ya estaba aprobada. */
  onSaved: (clashingAppointments: number) => void;
}

/**
 * Corrige una solicitud ya capturada (p. ej. una fecha mal puesta) sin que
 * quien la pidió tenga que enviar otra. Si la solicitud ya estaba aprobada,
 * el bloqueo del calendario se mueve al rango corregido.
 */
export function EditLeaveDialog({ leave, onClose, onSaved }: Props) {
  const [area, setArea] = useState<Speciality>(Speciality.CLINICAL);
  const [program, setProgram] = useState<LeaveProgram>(LeaveProgram.SOCIAL_SERVICE);
  const [unit, setUnit] = useState<LeaveUnit>(LeaveUnit.HOURS);
  const [quantity, setQuantity] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byHours = unit === LeaveUnit.HOURS;

  useEffect(() => {
    if (!leave) return;
    setArea(leave.area);
    setProgram(leave.program);
    setUnit(leave.unit);
    setQuantity(String(leave.quantity));
    setStartDate(formatMxDateInput(leave.startDate));
    setEndDate(formatMxDateInput(leave.endDate));
    setStartTime(leave.startTime ?? "");
    setEndTime(leave.endTime ?? "");
    setReason(leave.reason);
    setError(null);
  }, [leave]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!leave) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/leave-requests/${leave.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        program,
        unit,
        quantity,
        startDate,
        endDate: byHours ? startDate : endDate,
        startTime: byHours ? startTime : null,
        endTime: byHours ? endTime : null,
        reason,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar el cambio.");
      return;
    }

    const data = await res.json().catch(() => ({ clashingAppointments: 0 }));
    onSaved(data.clashingAppointments ?? 0);
  }

  return (
    <Dialog open={!!leave} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar solicitud de permiso</DialogTitle>
          <DialogDescription>
            {leave?.psychologist.user.name}. Si la solicitud ya estaba
            aceptada, el bloqueo en su agenda se mueve al rango corregido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Área</Label>
              <Select value={area} onValueChange={(v) => setArea(v as Speciality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(Speciality).map((s) => (
                    <SelectItem key={s} value={s}>{specialityLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de colaboración</Label>
              <Select
                value={program}
                onValueChange={(v) => setProgram(v as LeaveProgram)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(LeaveProgram).map((p) => (
                    <SelectItem key={p} value={p}>{leaveProgramLabels[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Solicita *</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as LeaveUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(LeaveUnit).map((u) => (
                    <SelectItem key={u} value={u}>{leaveUnitLabels[u]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-leave-qty">Cantidad *</Label>
              <Input
                id="edit-leave-qty"
                type="number"
                min={1}
                max={90}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{byHours ? "Fecha de ausencia *" : "Primer día *"}</Label>
              <CalendarDayPicker
                value={startDate}
                onChange={(v) => {
                  setStartDate(v);
                  if (byHours || v > endDate) setEndDate(v);
                }}
              />
            </div>
            {!byHours && (
              <div className="space-y-2">
                <Label>Último día *</Label>
                <CalendarDayPicker value={endDate} onChange={setEndDate} />
              </div>
            )}
          </div>

          {byHours && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-leave-start-time">De *</Label>
                <Input
                  id="edit-leave-start-time"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-leave-end-time">A *</Label>
                <Input
                  id="edit-leave-end-time"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-leave-reason">Motivo del permiso *</Label>
            <Textarea
              id="edit-leave-reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
