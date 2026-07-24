"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, ExternalLink, Search } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatMxDate, formatMxDateInput, mxSlotToISO } from "@/lib/utils";

interface FolioItem {
  id: string;
  folio: number;
  isHistorical: boolean;
  patientName: string;
  fileNumber: string | null;
  evaluatorName: string;
  diagnosis: string | null;
  firstInterviewAt: string | null;
  resultsDeliveryAt: string | null;
  evaluationDateText: string | null;
  reportLink: string | null;
  patient: { id: string } | null;
  evaluator: { id: string; name: string } | null;
}

/**
 * Cómo se muestra la fecha de evaluación. Los folios nuevos traen el rango
 * capturado con calendario; los del registro en papel, el texto literal del
 * Excel, que en muchos casos ya es un rango escrito a mano.
 */
function evaluationDate(f: FolioItem): string {
  if (f.firstInterviewAt && f.resultsDeliveryAt) {
    return `${formatMxDate(f.firstInterviewAt)} – ${formatMxDate(f.resultsDeliveryAt)}`;
  }
  return f.evaluationDateText ?? "—";
}

export function OrphanEvaluationsList() {
  const { toast } = useToast();
  const [folios, setFolios] = useState<FolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<FolioItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos del formulario de edición.
  const [patientName, setPatientName] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [evaluatorName, setEvaluatorName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [dateText, setDateText] = useState("");
  const [firstInterview, setFirstInterview] = useState("");
  const [resultsDelivery, setResultsDelivery] = useState("");
  const [reportLink, setReportLink] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/evaluations");
    if (res.ok) {
      const all: FolioItem[] = await res.json();
      // Los folios ligados a un paciente se consultan y editan desde su
      // ficha; esta vista es solo para los que quedaron sin expediente.
      setFolios(all.filter((f) => f.patient === null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folios;
    return folios.filter((f) =>
      [f.folio, f.patientName, f.fileNumber, f.evaluatorName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [folios, query]);

  function openFolio(f: FolioItem) {
    setSelected(f);
    setEditing(false);
    setPatientName(f.patientName);
    setFileNumber(f.fileNumber ?? "");
    setEvaluatorName(f.evaluatorName);
    setDiagnosis(f.diagnosis ?? "");
    setDateText(f.evaluationDateText ?? "");
    setFirstInterview(f.firstInterviewAt ? formatMxDateInput(f.firstInterviewAt) : "");
    setResultsDelivery(
      f.resultsDeliveryAt ? formatMxDateInput(f.resultsDeliveryAt) : "",
    );
    setReportLink(f.reportLink ?? "");
    setError(null);
  }

  async function save() {
    if (!selected) return;

    if (firstInterview && resultsDelivery && resultsDelivery < firstInterview) {
      setError("La entrega de resultados no puede ser anterior a la primera entrevista.");
      return;
    }
    if (!selected.isHistorical && (!firstInterview || !resultsDelivery)) {
      setError("Indica las dos fechas de la evaluación.");
      return;
    }

    // Solo se manda lo que cambió: la ruta rechaza los campos de texto en un
    // folio nuevo, y mandar `diagnosis: ""` no pasaría la validación.
    const body: Record<string, unknown> = {
      firstInterviewAt: firstInterview ? mxSlotToISO(firstInterview, "00:00") : null,
      resultsDeliveryAt: resultsDelivery ? mxSlotToISO(resultsDelivery, "00:00") : null,
      reportLink: reportLink.trim(),
    };
    if (diagnosis.trim()) body.diagnosis = diagnosis.trim();
    if (selected.isHistorical) {
      body.patientName = patientName.trim();
      body.fileNumber = fileNumber.trim();
      body.evaluatorName = evaluatorName.trim();
      body.evaluationDateText = dateText.trim();
    }

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/evaluations/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const historicalCount = folios.filter((f) => f.isHistorical).length;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Folios sin expediente</h1>
          <p className="text-muted-foreground">
            Folios de evaluación del registro anterior cuyo paciente o evaluador ya
            no está dado de alta en el sistema. Los ligados a un expediente vigente
            se consultan desde la ficha del paciente.
          </p>
        </div>
        {folios.length > 0 && (
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar folio, paciente o evaluador…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando folios…</p>
      ) : folios.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay folios sin expediente ligado.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {shown.length} de {folios.length} folios
            {historicalCount > 0 && ` · ${historicalCount} del registro anterior`}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Folio</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Expediente</TableHead>
                  <TableHead>Evaluador</TableHead>
                  <TableHead>Fecha de evaluación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-semibold">
                      <span className="flex items-center gap-2">
                        {f.folio}
                        {f.isHistorical && (
                          <Badge variant="outline" className="font-normal">
                            Anterior
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openFolio(f)}
                        className="text-left font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {f.patientName}
                      </button>
                    </TableCell>
                    <TableCell>{f.fileNumber ?? "—"}</TableCell>
                    <TableCell>{f.evaluatorName}</TableCell>
                    <TableCell>{evaluationDate(f)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !saving && !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Folio de evaluación {selected.folio}
                  {selected.isHistorical && (
                    <Badge variant="outline" className="font-normal">
                      Registro anterior
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {selected.isHistorical
                    ? "Viene del registro en papel. Puedes completar lo que falte."
                    : selected.patientName}
                </DialogDescription>
              </DialogHeader>

              {editing ? (
                <div className="space-y-4">
                  {selected.isHistorical && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-patient">Nombre del paciente</Label>
                          <Input
                            id="edit-patient"
                            value={patientName}
                            onChange={(e) => setPatientName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-file">Número de expediente</Label>
                          <Input
                            id="edit-file"
                            value={fileNumber}
                            onChange={(e) => setFileNumber(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-evaluator">Nombre del evaluador</Label>
                        <Input
                          id="edit-evaluator"
                          value={evaluatorName}
                          onChange={(e) => setEvaluatorName(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-diagnosis">Diagnóstico</Label>
                    <Textarea
                      id="edit-diagnosis"
                      rows={4}
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder={
                        selected.isHistorical ? "El registro anterior no lo traía…" : ""
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Escribe el diagnóstico tal como aparece en el DSM-5.
                    </p>
                  </div>

                  {selected.isHistorical && (
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-date-text">
                        Fecha de evaluación (como venía)
                      </Label>
                      <Input
                        id="edit-date-text"
                        value={dateText}
                        onChange={(e) => setDateText(e.target.value)}
                        placeholder="18 de septiembre al 07 de octubre de 2025"
                      />
                      <p className="text-xs text-muted-foreground">
                        Si capturas las dos fechas de abajo, se muestran esas en su
                        lugar.
                      </p>
                    </div>
                  )}

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
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                  <dt className="font-medium text-muted-foreground">Folio</dt>
                  <dd className="col-span-2 font-semibold">{selected.folio}</dd>

                  <dt className="font-medium text-muted-foreground">Paciente</dt>
                  <dd className="col-span-2">{selected.patientName}</dd>

                  <dt className="font-medium text-muted-foreground">Expediente</dt>
                  <dd className="col-span-2">{selected.fileNumber ?? "—"}</dd>

                  <dt className="font-medium text-muted-foreground">Evaluador</dt>
                  <dd className="col-span-2">{selected.evaluatorName}</dd>

                  <dt className="font-medium text-muted-foreground">
                    Fecha de evaluación
                  </dt>
                  <dd className="col-span-2">{evaluationDate(selected)}</dd>

                  <dt className="font-medium text-muted-foreground">Diagnóstico</dt>
                  <dd className="col-span-2 whitespace-pre-wrap">
                    {selected.diagnosis ?? (
                      <span className="text-muted-foreground">Sin capturar</span>
                    )}
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
                      onClick={() => openFolio(selected)}
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
