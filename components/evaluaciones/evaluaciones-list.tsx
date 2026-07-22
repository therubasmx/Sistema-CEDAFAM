"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";
import { ServiceArea } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { serviceAreaLabels } from "@/lib/labels";
import { formatMxDate, formatMxDateInput, mxSlotToISO } from "@/lib/utils";

interface FolioItem {
  id: string;
  folio: number;
  diagnosis: string;
  firstInterviewAt: string;
  resultsDeliveryAt: string;
  reportLink: string | null;
  patient: {
    id: string;
    fullName: string;
    fileNumber: string | null;
    serviceArea: ServiceArea;
  };
  evaluator: { id: string; name: string };
}

export function EvaluacionesList() {
  const { toast } = useToast();
  const [folios, setFolios] = useState<FolioItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<FolioItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [firstInterview, setFirstInterview] = useState("");
  const [resultsDelivery, setResultsDelivery] = useState("");
  const [reportLink, setReportLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/evaluations");
    if (res.ok) setFolios(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openFolio(f: FolioItem) {
    setSelected(f);
    setEditing(false);
    setDiagnosis(f.diagnosis);
    setFirstInterview(formatMxDateInput(f.firstInterviewAt));
    setResultsDelivery(formatMxDateInput(f.resultsDeliveryAt));
    setReportLink(f.reportLink ?? "");
    setError(null);
  }

  async function save() {
    if (!selected) return;
    if (!diagnosis.trim()) {
      setError("Escribe el diagnóstico.");
      return;
    }
    if (!firstInterview || !resultsDelivery) {
      setError("Indica las dos fechas de la evaluación.");
      return;
    }
    if (resultsDelivery < firstInterview) {
      setError(
        "La entrega de resultados no puede ser anterior a la primera entrevista.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/evaluations/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diagnosis: diagnosis.trim(),
        firstInterviewAt: mxSlotToISO(firstInterview, "00:00"),
        resultsDeliveryAt: mxSlotToISO(resultsDelivery, "00:00"),
        reportLink: reportLink.trim(),
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar el folio.");
      return;
    }

    const updated: FolioItem = await res.json();
    setFolios((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    setSelected(updated);
    setEditing(false);
    toast({ title: "Folio actualizado", variant: "success" });
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">Evaluaciones</h1>
        <p className="text-muted-foreground">
          Folios que generan los evaluadores al entregar un diagnóstico. Abre un
          paciente para ver su diagnóstico y agregar el link del informe.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando folios…</p>
      ) : folios.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no hay folios de evaluación.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Folio</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Expediente</TableHead>
                <TableHead>Evaluador</TableHead>
                <TableHead>Primera entrevista</TableHead>
                <TableHead>Entrega de resultados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folios.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-semibold">{f.folio}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openFolio(f)}
                      className="text-left font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {f.patient.fullName}
                    </button>
                  </TableCell>
                  <TableCell>{f.patient.fileNumber ?? "—"}</TableCell>
                  <TableCell>{f.evaluator.name}</TableCell>
                  <TableCell>{formatMxDate(f.firstInterviewAt)}</TableCell>
                  <TableCell>{formatMxDate(f.resultsDeliveryAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !saving && !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Folio de evaluación {selected.folio}</DialogTitle>
                <DialogDescription>
                  {selected.patient.fullName} ·{" "}
                  {serviceAreaLabels[selected.patient.serviceArea]}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Folio</dt>
                <dd className="col-span-2 font-semibold">{selected.folio}</dd>

                <dt className="font-medium text-muted-foreground">Paciente</dt>
                <dd className="col-span-2">{selected.patient.fullName}</dd>

                <dt className="font-medium text-muted-foreground">Expediente</dt>
                <dd className="col-span-2">{selected.patient.fileNumber ?? "—"}</dd>

                <dt className="font-medium text-muted-foreground">Evaluador</dt>
                <dd className="col-span-2">{selected.evaluator.name}</dd>
              </dl>

              {editing ? (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-diagnosis">Diagnóstico</Label>
                    <Textarea
                      id="edit-diagnosis"
                      rows={4}
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Escribe el diagnóstico tal como aparece en el DSM-5.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-first-interview">Primera entrevista</Label>
                      <Input
                        id="edit-first-interview"
                        type="date"
                        value={firstInterview}
                        onChange={(e) => setFirstInterview(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-results-delivery">
                        Entrega de resultados
                      </Label>
                      <Input
                        id="edit-results-delivery"
                        type="date"
                        value={resultsDelivery}
                        onChange={(e) => setResultsDelivery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-report-link">Link (opcional)</Label>
                    <Input
                      id="edit-report-link"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={reportLink}
                      onChange={(e) => setReportLink(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-t pt-4 text-sm">
                  <dt className="font-medium text-muted-foreground">
                    Fecha de evaluación
                  </dt>
                  <dd className="col-span-2">
                    {formatMxDate(selected.firstInterviewAt)} –{" "}
                    {formatMxDate(selected.resultsDeliveryAt)}
                  </dd>

                  <dt className="font-medium text-muted-foreground">Diagnóstico</dt>
                  <dd className="col-span-2 whitespace-pre-wrap">
                    {selected.diagnosis}
                  </dd>

                  <dt className="font-medium text-muted-foreground">Link</dt>
                  <dd className="col-span-2">
                    {selected.reportLink ? (
                      <a
                        href={selected.reportLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 break-all text-primary underline underline-offset-4"
                      >
                        {selected.reportLink}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </dl>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                {editing ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        openFolio(selected);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="button" disabled={saving} onClick={save}>
                      {saving ? "Guardando…" : "Guardar"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelected(null)}
                    >
                      Cerrar
                    </Button>
                    <Button type="button" onClick={() => setEditing(true)}>
                      Editar
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
