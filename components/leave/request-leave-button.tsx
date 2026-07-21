"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarOff } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import {
  leaveProgramLabels,
  leaveUnitLabels,
  specialityLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Props {
  /** Especialidad del psicólogo, para precargar el área del formato. */
  defaultArea?: Speciality | null;
  className?: string;
}

/**
 * Botón anclado al pie del menú lateral. Reproduce el formato de permiso en
 * papel del centro; el nombre y la fecha de solicitud no se capturan porque
 * salen de la sesión.
 */
export function RequestLeaveButton({ defaultArea, className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        className={cn("w-full justify-start", className)}
        onClick={() => setOpen(true)}
      >
        <CalendarOff className="h-4 w-4" /> Solicitar permiso
      </Button>
      <RequestLeaveDialog
        open={open}
        onOpenChange={setOpen}
        defaultArea={defaultArea}
      />
    </>
  );
}

function RequestLeaveDialog({
  open,
  onOpenChange,
  defaultArea,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultArea?: Speciality | null;
}) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");

  const [area, setArea] = useState<Speciality>(defaultArea ?? Speciality.CLINICAL);
  const [program, setProgram] = useState<LeaveProgram>(LeaveProgram.SOCIAL_SERVICE);
  const [unit, setUnit] = useState<LeaveUnit>(LeaveUnit.HOURS);
  const [quantity, setQuantity] = useState("1");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byHours = unit === LeaveUnit.HOURS;

  function reset() {
    setQuantity("1");
    setStartDate(today);
    setEndDate(today);
    setStartTime("");
    setEndTime("");
    setReason("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        program,
        unit,
        quantity,
        startDate,
        // Un permiso por horas siempre cae en un solo día.
        endDate: byHours ? startDate : endDate,
        startTime: byHours ? startTime : null,
        endTime: byHours ? endTime : null,
        reason,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo enviar la solicitud.");
      return;
    }

    toast({
      title: "Solicitud enviada",
      description: "Coordinación Desarrollo Profesional la revisará.",
      variant: "success",
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitud de permiso</DialogTitle>
          <DialogDescription>
            Se envía a Coordinación Desarrollo Profesional. Si se acepta, ese
            horario queda bloqueado en tu agenda.
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
              <Label htmlFor="leave-qty">Cantidad *</Label>
              <Input
                id="leave-qty"
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
              <Label htmlFor="leave-start-date">
                {byHours ? "Fecha de ausencia *" : "Primer día *"}
              </Label>
              <Input
                id="leave-start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (byHours || e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </div>
            {!byHours && (
              <div className="space-y-2">
                <Label htmlFor="leave-end-date">Último día *</Label>
                <Input
                  id="leave-end-date"
                  type="date"
                  required
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {byHours && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-start-time">De *</Label>
                <Input
                  id="leave-start-time"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end-time">A *</Label>
                <Input
                  id="leave-end-time"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="leave-reason">Motivo del permiso *</Label>
            <Textarea
              id="leave-reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explica brevemente el motivo y, si aplica, cómo repondrás el tiempo."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
