"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn, formatMxTime } from "@/lib/utils";

export interface CoordinationChecklistEntry {
  id: string;
  scheduledAt: string;
  patientName: string;
  patientFileNumber: string | null;
  psychologistName: string;
  checked: boolean;
}

interface CoordinationChecklistPanelProps {
  data: CoordinationChecklistEntry[];
}

export function CoordinationChecklistPanel({ data }: CoordinationChecklistPanelProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState(data);
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function toggle(id: string, checked: boolean) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, checked } : e)));
    setPending((prev) => new Set(prev).add(id));

    const res = await fetch(`/api/appointments/${id}/coordination-check`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    });

    setPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (!res.ok) {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, checked: !checked } : e)));
      toast({ title: "No se pudo actualizar la casilla.", variant: "destructive" });
    }
  }

  const checkedCount = entries.filter((e) => e.checked).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Citas de hoy</CardTitle>
          <CardDescription>
            Checklist de citas registradas por los psicólogos.
            {entries.length > 0 && ` ${checkedCount}/${entries.length} revisadas.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay citas registradas hoy.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary"
                  checked={e.checked}
                  disabled={pending.has(e.id)}
                  onChange={(ev) => toggle(e.id, ev.target.checked)}
                  aria-label={`Marcar cita de ${e.patientName} como revisada`}
                />
                <span
                  className={cn(
                    "w-14 shrink-0 text-sm font-medium",
                    e.checked && "text-muted-foreground line-through",
                  )}
                >
                  {formatMxTime(e.scheduledAt)}
                </span>
                <span
                  className={cn(
                    "flex-1 truncate text-sm",
                    e.checked && "text-muted-foreground line-through",
                  )}
                >
                  {e.patientName}
                  {e.patientFileNumber && (
                    <span className="text-xs"> · Exp. {e.patientFileNumber}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs text-muted-foreground",
                    e.checked && "line-through",
                  )}
                >
                  {e.psychologistName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
