"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatMxDateInput } from "@/lib/utils";
import { getDaysInMonth, startOfMonth, format, addMonths, subMonths, isSameDay } from "date-fns";
import { es } from "date-fns/locale";

interface CalendarDayPickerProps {
  /** Fecha elegida, "YYYY-MM-DD" o "" si ninguna. */
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
}

/** Calendario mensual visual para elegir un día ("YYYY-MM-DD"). */
export function CalendarDayPicker({ value, onChange, minDate }: CalendarDayPickerProps) {
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const minDateObj = (() => {
    const d = minDate ? new Date(minDate + "T00:00:00") : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const daysInMonth = getDaysInMonth(currentDate);
  const monthStart = startOfMonth(currentDate);
  const startingDayOfWeek = monthStart.getDay();

  const calendarDays: (number | null)[] = [
    ...Array(startingDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedDateObj = value ? new Date(value + "T00:00:00") : null;
  const monthYear = format(currentDate, "MMMM yyyy", { locale: es });

  function handleDayClick(day: number) {
    const newDate = new Date(currentDate);
    newDate.setDate(day);
    newDate.setHours(0, 0, 0, 0);
    if (newDate >= minDateObj) {
      onChange(formatMxDateInput(newDate));
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCurrentDate((d) => subMonths(d, 1))}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">{monthYear}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCurrentDate((d) => addMonths(d, 1))}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1">
        {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="aspect-square" />;

          const dayDate = new Date(currentDate);
          dayDate.setDate(day);
          dayDate.setHours(0, 0, 0, 0);

          const isSelected = selectedDateObj && isSameDay(selectedDateObj, dayDate);
          const isEnabled = dayDate >= minDateObj;

          return (
            <button
              key={`day-${day}`}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={!isEnabled}
              className={cn(
                "aspect-square flex items-center justify-center rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isEnabled
                    ? "border border-input hover:border-primary hover:bg-accent"
                    : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
