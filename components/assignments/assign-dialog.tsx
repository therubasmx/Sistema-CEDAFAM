"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import type { ConsultationCategory, ReferenceType } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppointmentDialog } from "@/components/calendar/appointment-dialog";
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
import {
  consultationCategoryLabels,
  consultationCategoryOrder,
  referenceTypeLabels,
  specialityLabels,
  workTypeLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Suggestion {
  psychologistId: string;
  name: string;
  speciality: keyof typeof specialityLabels;
  workType: keyof typeof workTypeLabels;
  activePatientCount: number;
  specialityMatch: boolean;
  profileMatch: boolean;
  hasAvailability: boolean;
  score: number;
}

interface AppliedRule {
  id: string;
  description: string;
  profile: string;
  byCapacity: boolean;
}

/** Contexto del motivo de consulta que devuelve el endpoint de sugerencias. */
interface PatientContext {
  consultationReason: string;
  consultationCategory: ConsultationCategory | null;
  age: number;
  referenceType: ReferenceType;
}

interface SuggestionsResponse {
  patient: PatientContext | null;
  rule: AppliedRule | null;
  suggestions: Suggestion[];
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
  const { data: session } = useSession();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [rule, setRule] = useState<AppliedRule | null>(null);
  const [context, setContext] = useState<PatientContext | null>(null);
  const [all, setAll] = useState<Psychologist[]>([]);
  const [category, setCategory] = useState<ConsultationCategory | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [exploratory, setExploratory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<{
    patientId: string;
    psychologistId: string;
  } | null>(null);

  const fetchSuggestions = useCallback(
    async (forCategory: ConsultationCategory | null): Promise<SuggestionsResponse> => {
      const query = new URLSearchParams({ patientId });
      if (forCategory) query.set("category", forCategory);
      const res = await fetch(`/api/assignments/suggestions?${query}`);
      if (!res.ok) return { patient: null, rule: null, suggestions: [] };
      return (await res.json()) as SuggestionsResponse;
    },
    [patientId],
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected("");
    setExploratory(false);
    Promise.all([
      fetchSuggestions(null),
      fetch("/api/psychologists").then((r) => (r.ok ? r.json() : [])),
    ]).then(([sug, psy]) => {
      setContext(sug.patient);
      setCategory(sug.patient?.consultationCategory ?? null);
      setRule(sug.rule);
      setSuggestions(sug.suggestions);
      setAll(psy);
      if (sug.suggestions[0]) setSelected(sug.suggestions[0].psychologistId);
      setLoading(false);
    });
  }, [open, fetchSuggestions]);

  /**
   * Al elegir categoría se vuelven a puntuar las sugerencias con la regla que
   * le corresponde y se guarda en el expediente, para que quede clasificado
   * aunque la asignación se termine después.
   */
  async function changeCategory(next: ConsultationCategory) {
    setCategory(next);
    setScoring(true);
    const sug = await fetchSuggestions(next);
    setRule(sug.rule);
    setSuggestions(sug.suggestions);
    setSelected(sug.suggestions[0]?.psychologistId ?? "");
    setScoring(false);

    const res = await fetch(`/api/patients/${patientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationCategory: next }),
    });
    if (!res.ok) {
      toast({
        title: "No se pudo guardar la categoría",
        description: "Las sugerencias sí se actualizaron.",
        variant: "destructive",
      });
    }
  }

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
    // Encadena el agendado: el psicólogo y el paciente ya quedan cargados,
    // solo falta elegir día y hora (o el usuario puede omitir este paso).
    setScheduleFor({ patientId, psychologistId: selected });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Asignar a {patientName}</DialogTitle>
            <DialogDescription>
              Sugerencias basadas en el motivo de consulta, la especialidad, la carga
              y la disponibilidad. La decisión final es tuya.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Motivo de consulta</Label>
                <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {context?.consultationReason || "—"}
                </p>
                {context && (
                  <p className="text-xs text-muted-foreground">
                    {context.age} años · {referenceTypeLabels[context.referenceType]}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Categoría del motivo</Label>
                <Select
                  value={category ?? undefined}
                  onValueChange={(v) => changeCategory(v as ConsultationCategory)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categorizar" />
                  </SelectTrigger>
                  <SelectContent>
                    {consultationCategoryOrder.map((c) => (
                      <SelectItem key={c} value={c}>
                        {consultationCategoryLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rule ? (
                  <p className="text-xs text-muted-foreground">{rule.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sin categoría, las sugerencias se calculan solo por área de servicio.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-primary" /> Sugerencias
                  {rule && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      · Perfil recomendado: {rule.profile}
                    </span>
                  )}
                </Label>
                {scoring ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    Recalculando sugerencias…
                  </p>
                ) : suggestions.length === 0 ? (
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
                            {workTypeLabels[s.workType]} · {s.activePatientCount}{" "}
                            pacientes activos
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {s.profileMatch ? (
                            <Badge variant="success">
                              {rule?.byCapacity ? "Con cupo" : "Perfil sugerido"}
                            </Badge>
                          ) : (
                            s.specialityMatch && (
                              <Badge variant="warning">Otro tipo de contrato</Badge>
                            )
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
                Sesión de exploración
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

      {scheduleFor && session?.user && (
        <AppointmentDialog
          open={!!scheduleFor}
          onOpenChange={(o) => !o && setScheduleFor(null)}
          onSaved={() => setScheduleFor(null)}
          role={session.user.role}
          psychologistId={session.user.psychologistId}
          initialPatientId={scheduleFor.patientId}
          initialPsychologistId={scheduleFor.psychologistId}
          cancelLabel="Omitir paso"
        />
      )}
    </>
  );
}
