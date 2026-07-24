"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileSearch } from "lucide-react";
import { AppointmentStatus, ServiceArea } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { serviceAreaLabels } from "@/lib/labels";
import { getLastActivityAt, isExpedienteVigente } from "@/lib/patient-status";

interface MatchFolio {
  folio: number;
  patientName: string;
  fileNumber: string | null;
  evaluatorName: string;
  diagnosis: string | null;
  firstInterviewAt: string | null;
  resultsDeliveryAt: string | null;
  evaluationDateText: string | null;
}

interface CandidatePatient {
  id: string;
  fullName: string;
  fileNumber: string | null;
  phoneNumber: string;
  serviceArea: ServiceArea;
  createdAt: string;
  appointments: { scheduledAt: string; status: AppointmentStatus }[];
  statuses: { changedAt: string }[];
}

interface MatchItem {
  id: string;
  createdAt: string;
  evaluationFolio: MatchFolio;
  candidatePatient: CandidatePatient;
}

function formatDate(value: string | Date): string {
  return format(new Date(value), "d MMM yyyy", { locale: es });
}

/** Igual que en la ficha del paciente: rango capturado, o el texto literal del papel. */
function evaluationDate(folio: MatchFolio): string {
  if (folio.firstInterviewAt && folio.resultsDeliveryAt) {
    return `${formatDate(folio.firstInterviewAt)} – ${formatDate(folio.resultsDeliveryAt)}`;
  }
  return folio.evaluationDateText ?? "—";
}

export function EvaluationFolioMatchesList() {
  const { toast } = useToast();
  const [items, setItems] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MatchItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/evaluations/folio-matches");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openItem(item: MatchItem) {
    setSelected(item);
    setError(null);
  }

  async function decide(decision: "LINK" | "NOT_MATCH") {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/evaluations/folio-matches/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo procesar la revisión.");
      return;
    }
    toast({
      title: decision === "LINK" ? "Folio ligado al expediente" : "Marcado como no es él",
      variant: "success",
    });
    setItems((prev) => prev.filter((i) => i.id !== selected.id));
    setSelected(null);
  }

  async function scan() {
    setScanning(true);
    const res = await fetch("/api/evaluations/folio-matches/scan", { method: "POST" });
    setScanning(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: "No se pudo buscar", description: d.error, variant: "destructive" });
      return;
    }
    const result = await res.json();
    toast({
      title:
        result.created > 0
          ? `${result.created} candidato(s) nuevo(s) encontrado(s)`
          : "Sin candidatos nuevos",
      description: `${result.scanned} folios sin expediente revisados.`,
      variant: "success",
    });
    load();
  }

  const scanButton = (
    <Button variant="outline" size="sm" disabled={scanning} onClick={scan}>
      {scanning ? "Buscando…" : "Buscar coincidencias ahora"}
    </Button>
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{scanButton}</div>
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center">
          <FileSearch className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay folios por revisar. 🎉
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end">{scanButton}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between gap-3 rounded-md border bg-card p-4"
          >
            <div className="space-y-2">
              <p className="text-base font-semibold">{item.evaluationFolio.patientName}</p>
              <p className="text-sm text-muted-foreground">
                ¿o es… {item.candidatePatient.fullName}?
              </p>
              <p className="text-xs text-muted-foreground">
                Folio {item.evaluationFolio.folio} · mismo expediente de hospital
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openItem(item)}>
              Revisar
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Posible expediente de un folio anterior</DialogTitle>
                <DialogDescription>
                  El folio {selected.evaluationFolio.folio} del registro anterior y este
                  expediente comparten número de expediente de hospital. Compara los
                  datos y decide.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium text-muted-foreground">
                    Folio {selected.evaluationFolio.folio} (registro anterior)
                  </p>
                  <dl className="space-y-1">
                    <Field label="Nombre" value={selected.evaluationFolio.patientName} />
                    <Field
                      label="Expediente"
                      value={selected.evaluationFolio.fileNumber ?? "—"}
                    />
                    <Field label="Evaluador" value={selected.evaluationFolio.evaluatorName} />
                    <Field
                      label="Fecha de evaluación"
                      value={evaluationDate(selected.evaluationFolio)}
                    />
                  </dl>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-muted-foreground">Expediente encontrado</p>
                    <Badge
                      variant={
                        isExpedienteVigente(selected.candidatePatient) ? "success" : "destructive"
                      }
                    >
                      {isExpedienteVigente(selected.candidatePatient) ? "Vigente" : "Caducado"}
                    </Badge>
                  </div>
                  <dl className="space-y-1">
                    <Field label="Nombre" value={selected.candidatePatient.fullName} />
                    <Field
                      label="Expediente"
                      value={selected.candidatePatient.fileNumber ?? "—"}
                    />
                    <Field label="Teléfono" value={selected.candidatePatient.phoneNumber} />
                    <Field
                      label="Área"
                      value={serviceAreaLabels[selected.candidatePatient.serviceArea]}
                    />
                    <Field
                      label="Última actividad"
                      value={formatDate(getLastActivityAt(selected.candidatePatient))}
                    />
                  </dl>
                </div>
              </div>

              {selected.evaluationFolio.diagnosis && (
                <div className="text-sm">
                  <p className="font-medium text-muted-foreground">Diagnóstico del folio</p>
                  <p className="whitespace-pre-wrap">{selected.evaluationFolio.diagnosis}</p>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => decide("NOT_MATCH")}
                >
                  No es él
                </Button>
                <Button type="button" disabled={submitting} onClick={() => decide("LINK")}>
                  {submitting ? "Ligando…" : "Sí, ligar al expediente"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
