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
  diagnosis: string;
  /** Nulas solo en folios sin capturar; los nuevos siempre las traen. */
  firstInterviewAt: string | null;
  resultsDeliveryAt: string | null;
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
}

/**
 * "Crear folio de evaluación" en el expediente de un paciente de evaluación.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin folio el diálogo es el formulario de creación; con folio se abre en
  // modo consulta y solo el evaluador pasa a edición.
  const isForm = !folio || editing;

  function openDialog() {
    setDiagnosis(folio?.diagnosis ?? "");
    setFirstInterview(
      folio?.firstInterviewAt ? formatMxDateInput(folio.firstInterviewAt) : "",
    );
    setResultsDelivery(
      folio?.resultsDeliveryAt ? formatMxDateInput(folio.resultsDeliveryAt) : "",
    );
    setEditing(false);
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
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

    const payload = {
      diagnosis: diagnosis.trim(),
      firstInterviewAt: mxSlotToISO(firstInterview, "00:00"),
      resultsDeliveryAt: mxSlotToISO(resultsDelivery, "00:00"),
    };

    const res = folio
      ? await fetch(`/api/evaluations/${folio.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, patientId }),
        });

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

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folio ? `Folio de evaluación ${folio.folio}` : "Nuevo folio de evaluación"}
            </DialogTitle>
            <DialogDescription>
              {folio
                ? `Evaluación de ${patientName}, a cargo de ${folio.evaluatorName}.`
                : `Se generará un folio nuevo para ${patientName} al guardar.`}
            </DialogDescription>
          </DialogHeader>

          {isForm ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="folio-diagnosis">Diagnóstico</Label>
                <Textarea
                  id="folio-diagnosis"
                  rows={4}
                  autoFocus
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="F41.1 Trastorno de ansiedad generalizada…"
                />
                <p className="text-xs text-muted-foreground">
                  Escribe el diagnóstico tal como aparece en el DSM-5.
                </p>
              </div>

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
            </div>
          ) : (
            folio && (
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Folio</dt>
                <dd className="col-span-2 font-semibold">{folio.folio}</dd>

                <dt className="font-medium text-muted-foreground">Evaluador</dt>
                <dd className="col-span-2">{folio.evaluatorName}</dd>

                <dt className="font-medium text-muted-foreground">
                  Primera entrevista
                </dt>
                <dd className="col-span-2">
                  {folio.firstInterviewAt
                    ? formatMxDate(folio.firstInterviewAt)
                    : "—"}
                </dd>

                <dt className="font-medium text-muted-foreground">
                  Entrega de resultados
                </dt>
                <dd className="col-span-2">
                  {folio.resultsDeliveryAt
                    ? formatMxDate(folio.resultsDeliveryAt)
                    : "—"}
                </dd>

                <dt className="font-medium text-muted-foreground">Diagnóstico</dt>
                <dd className="col-span-2 whitespace-pre-wrap">{folio.diagnosis}</dd>

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
