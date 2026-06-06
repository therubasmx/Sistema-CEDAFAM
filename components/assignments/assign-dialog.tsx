"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { specialityLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Suggestion {
  psychologistId: string;
  name: string;
  speciality: keyof typeof specialityLabels;
  activePatientCount: number;
  specialityMatch: boolean;
  hasAvailability: boolean;
  score: number;
}

interface Psychologist {
  id: string;
  name: string;
  speciality: keyof typeof specialityLabels;
  activePatientCount: number;
}

interface AssignDialogProps {
  patientId: string;
  patientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}

export function AssignDialog({
  patientId,
  patientName,
  open,
  onOpenChange,
  onAssigned,
}: AssignDialogProps) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [all, setAll] = useState<Psychologist[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [exploratory, setExploratory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected("");
    setExploratory(false);
    Promise.all([
      fetch(`/api/assignments/suggestions?patientId=${patientId}`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch("/api/psychologists").then((r) => (r.ok ? r.json() : [])),
    ]).then(([sug, psy]) => {
      setSuggestions(sug);
      setAll(psy);
      if (sug[0]) setSelected(sug[0].psychologistId);
      setLoading(false);
    });
  }, [open, patientId]);

  async function assign() {
    if (!selected) return;
    setSubmitting(true);
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        psychologistId: selected,
        isExploratorySession: exploratory,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo asignar",
        description: data.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Paciente asignado", variant: "success" });
    onAssigned();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Asignar a {patientName}</DialogTitle>
          <DialogDescription>
            Sugerencias basadas en especialidad, carga y disponibilidad. La
            decisión final es tuya.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-primary" /> Sugerencias
              </Label>
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay psicólogos disponibles.
                </p>
              ) : (
                <div className="grid gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={s.psychologistId}
                      onClick={() => setSelected(s.psychologistId)}
                      className={cn(
                        "flex items-center justify-between rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
                        selected === s.psychologistId &&
                          "border-primary ring-1 ring-primary",
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {s.name}
                          {i === 0 && <Badge>Mejor opción</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {specialityLabels[s.speciality]} ·{" "}
                          {s.activePatientCount} pacientes activos
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {s.specialityMatch && (
                          <Badge variant="success">Especialidad</Badge>
                        )}
                        {!s.hasAvailability && (
                          <Badge variant="warning">Sin horario</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>O elige manualmente</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un psicólogo" />
                </SelectTrigger>
                <SelectContent>
                  {all.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {specialityLabels[p.speciality]} (
                      {p.activePatientCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={exploratory}
                onChange={(e) => setExploratory(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Sesión de exploración (temporal, gratuita)
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={assign} disabled={!selected || submitting}>
                {submitting ? "Asignando…" : "Asignar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
