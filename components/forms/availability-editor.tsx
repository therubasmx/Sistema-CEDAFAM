"use client";

import { useEffect, useMemo, useState } from "react";
import { TimeSlot } from "@prisma/client";
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

const SLOTS: { value: TimeSlot; label: string }[] = [
  { value: TimeSlot.MORNING, label: "Matutino (9:00–11:00)" },
  { value: TimeSlot.AFTERNOON, label: "Vespertino (14:30–17:30)" },
];

interface Block {
  dayOfWeek: number;
  startTime: string;
}

/** Map a stored start time back to its slot. */
function timeToSlot(startTime: string): TimeSlot {
  return startTime.startsWith("09") ? TimeSlot.MORNING : TimeSlot.AFTERNOON;
}

export function AvailabilityEditor({ psychologistId }: { psychologistId: string }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const key = (day: number, slot: TimeSlot) => `${day}-${slot}`;

  useEffect(() => {
    fetch(`/api/psychologists/${psychologistId}/availability`)
      .then((r) => (r.ok ? r.json() : []))
      .then((blocks: Block[]) => {
        setSelected(
          new Set(blocks.map((b) => key(b.dayOfWeek, timeToSlot(b.startTime)))),
        );
        setLoading(false);
      });
  }, [psychologistId]);

  function toggle(day: number, slot: TimeSlot) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(day, slot);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  const blocks = useMemo(
    () =>
      [...selected].map((k) => {
        const [day, slot] = k.split("-");
        return { dayOfWeek: Number(day), slot: slot as TimeSlot };
      }),
    [selected],
  );

  async function save() {
    setSaving(true);
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

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {DAYS.map((d) => (
          <div key={d.value} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-28 text-sm font-medium">{d.label}</span>
            <div className="flex flex-wrap gap-2">
              {SLOTS.map((s) => {
                const active = selected.has(key(d.value, s.value));
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggle(d.value, s.value)}
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
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar disponibilidad"}
      </Button>
    </div>
  );
}
