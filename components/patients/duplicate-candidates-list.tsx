"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Users } from "lucide-react";
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

interface CandidatePatient {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  curp: string | null;
  phoneNumber: string;
  fileNumber: string | null;
  serviceArea: ServiceArea;
  consultationReason: string;
  createdAt: string;
  appointments: { scheduledAt: string; status: AppointmentStatus }[];
  statuses: { changedAt: string }[];
  _count: {
    appointments: number;
    statuses: number;
    assignments: number;
    siere: number;
    evaluationFolios: number;
  };
}

interface CandidateItem {
  id: string;
  patientAName: string;
  patientBName: string;
  matchedByField: "phoneNumber" | "fileNumber";
  createdAt: string;
  patientA: CandidatePatient;
  patientB: CandidatePatient;
}

const matchedByFieldLabels: Record<CandidateItem["matchedByField"], string> = {
  phoneNumber: "Mismo teléfono y nombre similar",
  fileNumber: "Mismo expediente y nombre similar",
};

function formatDate(value: string | Date): string {
  return format(new Date(value), "d MMM yyyy", { locale: es });
}

function historySummary(patient: CandidatePatient): string {
  const parts = [
    patient._count.appointments && `${patient._count.appointments} citas`,
    patient._count.statuses && `${patient._count.statuses} estados`,
    patient._count.assignments && `${patient._count.assignments} asignaciones`,
    patient._count.siere && `${patient._count.siere} SIERE`,
    patient._count.evaluationFolios && `${patient._count.evaluationFolios} folios`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Sin historial registrado";
}

export function DuplicateCandidatesList() {
  const { toast } = useToast();
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CandidateItem | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/patients/duplicate-candidates");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openItem(item: CandidateItem) {
    setSelected(item);
    setError(null);
    // Sugerencia inicial: el expediente con actividad más reciente.
    const aIsNewer =
      getLastActivityAt(item.patientA).getTime() >= getLastActivityAt(item.patientB).getTime();
    setKeepId(aIsNewer ? item.patientA.id : item.patientB.id);
  }

  async function decide(decision: "MERGE" | "NOT_DUPLICATE") {
    if (!selected) return;
    if (decision === "MERGE" && !keepId) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/patients/duplicate-candidates/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        decision === "MERGE" ? { decision, keepPatientId: keepId } : { decision },
      ),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo procesar la revisión.");
      return;
    }
    toast({
      title: decision === "MERGE" ? "Expedientes fusionados" : "Marcado como no duplicado",
      variant: "success",
    });
    setItems((prev) => prev.filter((i) => i.id !== selected.id));
    setSelected(null);
  }

  async function scan() {
    setScanning(true);
    const res = await fetch("/api/patients/duplicate-candidates/scan", { method: "POST" });
    setScanning(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo escanear",
        description: d.error,
        variant: "destructive",
      });
      return;
    }
    const result = await res.json();
    toast({
      title:
        result.created > 0
          ? `${result.created} candidato(s) nuevo(s) encontrado(s)`
          : "Sin candidatos nuevos",
      description: `${result.scanned} expedientes revisados.`,
      variant: "success",
    });
    load();
  }

  const scanButton = (
    <Button variant="outline" size="sm" disabled={scanning} onClick={scan}>
      {scanning ? "Buscando…" : "Buscar duplicados ahora"}
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
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay expedientes por revisar. 🎉
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
              <p className="text-base font-semibold">{item.patientAName}</p>
              <p className="text-sm text-muted-foreground">¿o es… {item.patientBName}?</p>
              <p className="text-xs text-muted-foreground">
                {matchedByFieldLabels[item.matchedByField]}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => openItem(item)}>
              Revisar
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Posible expediente duplicado</DialogTitle>
                <DialogDescription>
                  {matchedByFieldLabels[selected.matchedByField]}. Compara el historial y
                  elige cuál expediente se conserva, o marca que son personas distintas.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {[selected.patientA, selected.patientB].map((patient) => {
                  const vigente = isExpedienteVigente(patient);
                  const isKeepChoice = keepId === patient.id;
                  return (
                    <div
                      key={patient.id}
                      className={`space-y-2 rounded-md border p-3 ${
                        isKeepChoice ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{patient.fullName}</p>
                        <Badge variant={vigente ? "success" : "destructive"}>
                          {vigente ? "Vigente" : "Caducado"}
                        </Badge>
                      </div>
                      <dl className="space-y-1">
                        <Field label="Teléfono" value={patient.phoneNumber} />
                        <Field label="Expediente hospital" value={patient.fileNumber ?? "—"} />
                        <Field label="CURP" value={patient.curp ?? "—"} />
                        <Field
                          label="F. nacimiento"
                          value={patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "—"}
                        />
                        <Field label="Área" value={serviceAreaLabels[patient.serviceArea]} />
                        <Field label="Expediente abierto" value={formatDate(patient.createdAt)} />
                        <Field
                          label="Última actividad"
                          value={formatDate(getLastActivityAt(patient))}
                        />
                      </dl>
                      <p className="text-xs text-muted-foreground">
                        {historySummary(patient)}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant={isKeepChoice ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setKeepId(patient.id)}
                      >
                        {isKeepChoice ? "Se conservará este" : "Conservar este"}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Al fusionar, todo el historial (citas, estados, asignaciones, SIERE,
                folios) del expediente descartado pasa al que se conserva, y sus datos
                de contacto vacíos se completan con los del descartado.
              </p>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => decide("NOT_DUPLICATE")}
                >
                  No son duplicados
                </Button>
                <Button
                  type="button"
                  disabled={submitting || !keepId}
                  onClick={() => decide("MERGE")}
                >
                  {submitting ? "Fusionando…" : "Fusionar expedientes"}
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
