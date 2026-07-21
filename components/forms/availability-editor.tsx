"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
];

interface HourSlot {
  startTime: string;
  endTime: string;
  label: string;
}

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

interface Block {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const key = (day: number, start: string) => `${day}|${start}`;

export function AvailabilityEditor({ psychologistId }: { psychologistId: string }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/psychologists/${psychologistId}/availability`)
      .then((r) => (r.ok ? r.json() : []))
      .then((blocks: Block[]) => {
        setSelected(new Set(blocks.map((b) => key(b.dayOfWeek, b.startTime))));
        setLoading(false);
      });
  }, [psychologistId]);

  function toggle(day: number, slot: HourSlot) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(day, slot.startTime);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const blocks: Block[] = [];
    for (const k of selected) {
      const [dayStr, startTime] = k.split("|");
      const day = Number(dayStr);
      const slot = daySlots(day).find((s) => s.startTime === startTime);
      if (slot) blocks.push({ dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime });
    }
    const res = await fetch(`/api/psychologists/${psychologistId}/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    setSaving(false);
    toast(
      res.ok
        ? { title: "Disponibilidad guardada", variant: "success" }
        : { title: "No se pudo guardar", variant: "destructive" },
    );
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {DAYS.map((d) => {
          const slots = daySlots(d.value);
          const morning = slots.filter((s) => s.startTime < "12:30");
          const afternoon = slots.filter((s) => s.startTime >= "12:30");
          return (
            <div key={d.value} className="space-y-1">
              <p className="text-sm font-semibold">{d.label}</p>
              <div className="space-y-1">
                {morning.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {morning.map((s) => {
                      const active = selected.has(key(d.value, s.startTime));
                      return (
                        <button
                          key={s.startTime}
                          type="button"
                          onClick={() => toggle(d.value, s)}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {afternoon.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {afternoon.map((s) => {
                      const active = selected.has(key(d.value, s.startTime));
                      return (
                        <button
                          key={s.startTime}
                          type="button"
                          onClick={() => toggle(d.value, s)}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-sm transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar disponibilidad"}
      </Button>
    </div>
  );
}
