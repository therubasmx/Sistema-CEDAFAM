"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatMxDate, formatMxDateInput, mxSlotToISO } from "@/lib/utils";

export interface PatientEvaluationFolio {
  id: string;
  folio: number;
  /** Marca los folios importados del registro en papel (ver EvaluationFolio en el schema). */
  isHistorical: boolean;
  diagnosis: string;
  /** Nulas solo en folios sin capturar; los nuevos siempre las traen. */
  firstInterviewAt: string | null;
  resultsDeliveryAt: string | null;
  /** Fecha literal del registro en papel; solo aplica a históricos. */
  evaluationDateText: string | null;
  reportLink: string | null;
  evaluatorName: string;
}

interface EvaluationFolioDialogProps {
  patientId: string;
  patientName: string;
  /** Folio ya emitido, si el paciente tiene uno. */
  folio: PatientEvaluationFolio | null;
  /** El evaluador puede corregir el folio que generó. */
  canEdit: boolean;
  /**
   * Trigger reducido a solo el número de folio, para listar varios folios
   * anteriores uno junto a otro en vez del botón completo.
   */
  compact?: boolean;
}

/** Cómo se muestra la fecha de evaluación, igual que en el listado de folios. */
function evaluationDate(folio: PatientEvaluationFolio): string {
  if (folio.firstInterviewAt && folio.resultsDeliveryAt) {
    return `${formatMxDate(folio.firstInterviewAt)} – ${formatMxDate(folio.resultsDeliveryAt)}`;
  }
  return folio.evaluationDateText ?? "—";
}

/**
 * "Crear folio de evaluación" en el expediente de un paciente de evaluación,
 * y también cómo se consulta/corrige cualquier folio ya emitido (el vigente
 * o uno de los que trae del registro anterior).
 *
 * El número de folio no se captura: lo asigna el servidor al guardar y se
 * muestra ya emitido. Si el paciente ya tiene folio, el botón lo abre para
 * consultarlo (y corregirlo, si es quien lo generó).
 */
export function EvaluationFolioDialog({
  patientId,
  patientName,
  folio,
  canEdit,
  compact = false,
}: EvaluationFolioDialogProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [diagnosis, setDiagnosis] = useState(folio?.diagnosis ?? "");
  const [firstInterview, setFirstInterview] = useState(
    folio?.firstInterviewAt ? formatMxDateInput(folio.firstInterviewAt) : "",
  );
  const [resultsDelivery, setResultsDelivery] = useState(
    folio?.resultsDeliveryAt ? formatMxDateInput(folio.resultsDeliveryAt) : "",
  );
  const [evaluatorName, setEvaluatorName] = useState(folio?.evaluatorName ?? "");
  const [evaluationDateText, setEvaluationDateText] = useState(
    folio?.evaluationDateText ?? "",
  );
  const [reportLink, setReportLink] = useState(folio?.reportLink ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin folio el diálogo es el formulario de creación; con folio se abre en
  // modo consulta y solo el evaluador pasa a edición.
  const isForm = !folio || editing;
  const isHistorical = folio?.isHistorical ?? false;

  function openDialog() {
    setDiagnosis(folio?.diagnosis ?? "");
    setFirstInterview(
      folio?.firstInterviewAt ? formatMxDateInput(folio.firstInterviewAt) : "",
    );
    setResultsDelivery(
      folio?.resultsDeliveryAt ? formatMxDateInput(folio.resultsDeliveryAt) : "",
    );
    setEvaluatorName(folio?.evaluatorName ?? "");
    setEvaluationDateText(folio?.evaluationDateText ?? "");
    setReportLink(folio?.reportLink ?? "");
    setEditing(false);
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    // Un folio nuevo, y las correcciones al vigente, siempre traen
    // diagnóstico y las dos fechas. Los del registro anterior pueden traer
    // solo lo que ya se sabe, y se completan poco a poco.
    if (!isHistorical) {
      if (!diagnosis.trim()) {
        setError("Escribe el diagnóstico.");
        return;
      }
      if (!firstInterview || !resultsDelivery) {
        setError("Indica las dos fechas de la evaluación.");
        return;
      }
    }
    if (firstInterview && resultsDelivery && resultsDelivery < firstInterview) {
      setError(
        "La entrega de resultados no puede ser anterior a la primera entrevista.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    let res: Response;
    if (!folio) {
      res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          diagnosis: diagnosis.trim(),
          firstInterviewAt: mxSlotToISO(firstInterview, "00:00"),
          resultsDeliveryAt: mxSlotToISO(resultsDelivery, "00:00"),
        }),
      });
    } else {
      const payload: Record<string, unknown> = {
        firstInterviewAt: firstInterview ? mxSlotToISO(firstInterview, "00:00") : null,
        resultsDeliveryAt: resultsDelivery ? mxSlotToISO(resultsDelivery, "00:00") : null,
        reportLink: reportLink.trim(),
      };
      if (diagnosis.trim()) payload.diagnosis = diagnosis.trim();
      if (isHistorical) {
        payload.evaluatorName = evaluatorName.trim();
        payload.evaluationDateText = evaluationDateText.trim();
      }
      res = await fetch(`/api/evaluations/${folio.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar el folio.");
      return;
    }

    const saved = await res.json();
    toast({
      title: folio ? "Folio actualizado" : `Folio ${saved.folio} generado`,
      variant: "success",
    });
    setOpen(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <>
      {compact && folio ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 font-mono"
          onClick={openDialog}
        >
          {folio.folio}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={openDialog}>
          {folio ? (
            <>
              <FileText className="mr-1 h-4 w-4" />
              Folio de evaluación
            </>
          ) : (
            <>
              <FilePlus2 className="mr-1 h-4 w-4" />
              Crear folio de evaluación
            </>
          )}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {folio ? `Folio de evaluación ${folio.folio}` : "Nuevo folio de evaluación"}
              {isHistorical && (
                <span className="rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  Registro anterior
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {folio
                ? `Evaluación de ${patientName}, a cargo de ${folio.evaluatorName}.`
                : `Se generará un folio nuevo para ${patientName} al guardar.`}
            </DialogDescription>
          </DialogHeader>

          {isForm ? (
            <div className="space-y-4">
              {isHistorical && (
                <div className="space-y-1.5">
                  <Label htmlFor="folio-evaluator">Nombre del evaluador</Label>
                  <Input
                    id="folio-evaluator"
                    value={evaluatorName}
                    onChange={(e) => setEvaluatorName(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="folio-diagnosis">Diagnóstico</Label>
                <Textarea
                  id="folio-diagnosis"
                  rows={4}
                  autoFocus={!isHistorical}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder={
                    isHistorical
                      ? "El registro anterior no lo traía…"
                      : "F41.1 Trastorno de ansiedad generalizada…"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Escribe el diagnóstico tal como aparece en el DSM-5.
                </p>
              </div>

              {isHistorical && (
                <div className="space-y-1.5">
                  <Label htmlFor="folio-date-text">
                    Fecha de evaluación (como venía)
                  </Label>
                  <Input
                    id="folio-date-text"
                    value={evaluationDateText}
                    onChange={(e) => setEvaluationDateText(e.target.value)}
                    placeholder="18 de septiembre al 07 de octubre de 2025"
                  />
                  <p className="text-xs text-muted-foreground">
                    Si capturas las dos fechas de abajo, se muestran esas en su
                    lugar.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Fecha de evaluación</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="folio-first-interview"
                      className="text-xs font-normal text-muted-foreground"
                    >
                      Primera entrevista
                    </Label>
                    <Input
                      id="folio-first-interview"
                      type="date"
                      value={firstInterview}
                      onChange={(e) => setFirstInterview(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="folio-results-delivery"
                      className="text-xs font-normal text-muted-foreground"
                    >
                      Entrega de resultados
                    </Label>
                    <Input
                      id="folio-results-delivery"
                      type="date"
                      value={resultsDelivery}
                      onChange={(e) => setResultsDelivery(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {folio && (
                <div className="space-y-1.5">
                  <Label htmlFor="folio-report-link">Link del informe (opcional)</Label>
                  <Input
                    id="folio-report-link"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={reportLink}
                    onChange={(e) => setReportLink(e.target.value)}
                  />
                </div>
              )}
            </div>
          ) : (
            folio && (
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Folio</dt>
                <dd className="col-span-2 font-semibold">{folio.folio}</dd>

                <dt className="font-medium text-muted-foreground">Evaluador</dt>
                <dd className="col-span-2">{folio.evaluatorName}</dd>

                <dt className="font-medium text-muted-foreground">
                  Fecha de evaluación
                </dt>
                <dd className="col-span-2">{evaluationDate(folio)}</dd>

                <dt className="font-medium text-muted-foreground">Diagnóstico</dt>
                <dd className="col-span-2 whitespace-pre-wrap">
                  {folio.diagnosis || (
                    <span className="text-muted-foreground">Sin capturar</span>
                  )}
                </dd>

                {folio.reportLink && (
                  <>
                    <dt className="font-medium text-muted-foreground">Informe</dt>
                    <dd className="col-span-2">
                      <a
                        href={folio.reportLink}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary underline underline-offset-4"
                      >
                        {folio.reportLink}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            )
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            {isForm ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => (folio ? setEditing(false) : setOpen(false))}
                >
                  Cancelar
                </Button>
                <Button type="button" disabled={saving} onClick={handleSave}>
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cerrar
                </Button>
                {canEdit && (
                  <Button type="button" onClick={() => setEditing(true)}>
                    Editar
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
