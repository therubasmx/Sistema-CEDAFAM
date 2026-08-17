"use client";

import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CalendarOff, ClipboardList, MessageSquare } from "lucide-react";
import { LeaveProgram, LeaveUnit, Speciality } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { CalendarDayPicker } from "@/components/ui/calendar-day-picker";
import {
  leaveProgramLabels,
  leaveUnitLabels,
  specialityLabels,
} from "@/lib/labels";
import { cn, formatMxDateInput } from "@/lib/utils";

interface Props {
  /** Especialidad del psicólogo, para precargar el área del formato. */
  defaultArea?: Speciality | null;
  className?: string;
  /** Menú lateral comprimido: mostrar solo el ícono. */
  collapsed?: boolean;
}

/** Encabezado de sección para agrupar visualmente los campos del formulario. */
function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ClipboardList;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h4>
      {children}
    </div>
  );
}

/**
 * Botón anclado al pie del menú lateral. Reproduce el formato de permiso en
 * papel del centro; el nombre y la fecha de solicitud no se capturan porque
 * salen de la sesión.
 */
export function RequestLeaveButton({
  defaultArea,
  className,
  collapsed,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        title={collapsed ? "Solicitar permiso" : undefined}
        className={cn(
          collapsed ? "w-full justify-center px-0" : "w-full justify-start",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <CalendarOff className="h-4 w-4" /> {!collapsed && "Solicitar permiso"}
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
  const [hasConflict, setHasConflict] = useState(false);
  const [checkingConflict, setCheckingConflict] = useState(false);

  const byHours = unit === LeaveUnit.HOURS;

  function reset() {
    setQuantity("1");
    setStartDate(today);
    setEndDate(today);
    setStartTime("");
    setEndTime("");
    setReason("");
    setError(null);
    setHasConflict(false);
  }

  // Mientras se llena fecha/horario, avisa de inmediato si ya hay una cita
  // agendada ahí, en vez de dejar que se entere hasta que Coordinación
  // rechace la solicitud.
  useEffect(() => {
    if (!open) return;
    if (!startDate || (!byHours && !endDate)) return;
    if (byHours && (!startTime || !endTime)) {
      setHasConflict(false);
      return;
    }

    const controller = new AbortController();
    setCheckingConflict(true);
    const params = new URLSearchParams({
      unit,
      startDate,
      endDate: byHours ? startDate : endDate,
      ...(byHours ? { startTime, endTime } : {}),
    });

    fetch(`/api/leave-requests/conflicts?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setHasConflict(!!d.hasConflict))
      .catch(() => {})
      .finally(() => setCheckingConflict(false));

    return () => controller.abort();
  }, [open, unit, startDate, endDate, startTime, endTime, byHours]);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            Solicitud de permiso
          </DialogTitle>
          <DialogDescription>
            Se envía a Coordinación Desarrollo Profesional. Si se acepta, ese
            horario queda bloqueado en tu agenda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-6">
          <FormSection icon={ClipboardList} title="Detalles del permiso">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-area">Área</Label>
                <Select value={area} onValueChange={(v) => setArea(v as Speciality)}>
                  <SelectTrigger id="leave-area"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(Speciality).map((s) => (
                      <SelectItem key={s} value={s}>{specialityLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-program">Tipo de colaboración</Label>
                <Select
                  value={program}
                  onValueChange={(v) => setProgram(v as LeaveProgram)}
                >
                  <SelectTrigger id="leave-program"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(LeaveProgram).map((p) => (
                      <SelectItem key={p} value={p}>{leaveProgramLabels[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-unit">Solicita *</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as LeaveUnit)}>
                  <SelectTrigger id="leave-unit"><SelectValue /></SelectTrigger>
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
          </FormSection>

          <FormSection icon={CalendarClock} title="Fecha y horario">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{byHours ? "Fecha de ausencia *" : "Primer día *"}</Label>
                <CalendarDayPicker
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    if (byHours || v > endDate) setEndDate(v);
                  }}
                  minDate={formatMxDateInput(new Date())}
                />
              </div>
              {!byHours && (
                <div className="space-y-2">
                  <Label>Último día *</Label>
                  <CalendarDayPicker
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate || formatMxDateInput(new Date())}
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

            {hasConflict && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Ya tienes una cita agendada en ese horario. Reagéndala o
                  cancélala antes de solicitar este permiso.
                </p>
              </div>
            )}
          </FormSection>

          <FormSection icon={MessageSquare} title="Motivo">
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
          </FormSection>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || hasConflict || checkingConflict}
            >
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
