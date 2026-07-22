"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { CalendarDayPicker } from "@/components/ui/calendar-day-picker";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface TimeSlot {
  startTime: string;
  label: string;
  available: boolean;
  reason?: string;
}

interface DateTimeSelectorProps {
  value: { date: string; time: string };
  onChange: (value: { date: string; time: string }) => void;
  slots: TimeSlot[] | null;
  loading: boolean;
  minDate?: string;
  error?: string | null;
}

export function DateTimeSelector({
  value,
  onChange,
  slots,
  loading,
  minDate,
  error,
}: DateTimeSelectorProps) {
  const hasSlots = slots !== null && slots.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <Label className="text-base font-semibold">Selecciona un día</Label>
          <CalendarDayPicker
            value={value.date}
            onChange={(date) => onChange({ date, time: "" })}
            minDate={minDate}
          />
        </div>

        <div className="space-y-3">
          <Label className="text-base font-semibold">Selecciona una hora</Label>
          <div className="rounded-lg border bg-card p-4">
            {!value.date ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Elige un día para ver horarios disponibles
              </p>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="mb-2 h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cargando horarios…</p>
              </div>
            ) : !hasSlots ? (
              <div className="flex gap-2 rounded-md bg-muted/40 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No hay horarios disponibles ese día.
                </p>
              </div>
            ) : (
              <div className="grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto">
                {slots!.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() => onChange({ date: value.date, time: slot.startTime })}
                    disabled={!slot.available}
                    className={cn(
                      "flex flex-col items-center rounded-md border px-2 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      !slot.available
                        ? "cursor-not-allowed border-border/40 text-muted-foreground/50"
                        : value.time === slot.startTime
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:border-primary hover:bg-accent",
                    )}
                  >
                    <span>{slot.label}</span>
                    {!slot.available && slot.reason && (
                      <span className="text-xs opacity-70">{slot.reason}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {value.date && value.time && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium">
            📅 {format(new Date(value.date + "T00:00:00"), "EEEE, d 'de' MMMM", { locale: es })} a las {value.time}
          </p>
        </div>
      )}

      {error && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
