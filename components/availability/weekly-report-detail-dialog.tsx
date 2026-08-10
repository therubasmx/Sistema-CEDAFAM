"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ServiceType, type DiscountLevel } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  serviceTypeLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
  patientTypeLabels,
  discountLevelLabels,
} from "@/lib/labels";
import { weekLabel } from "@/lib/week";

interface PatientUpdateRow {
  id: string;
  serviceType: ServiceType;
  therapyStatus: keyof typeof therapyStatusLabels | null;
  evaluationStatus: keyof typeof evaluationStatusLabels | null;
  patientType: keyof typeof patientTypeLabels | null;
  discountLevel: DiscountLevel | null;
  patient: { fullName: string };
}

interface WeeklyReportDetail {
  id: string;
  weekStartDate: string;
  submittedAt: string;
  hoursOfAttention: number;
  activePatientCount: number;
  notes: string | null;
  psychologist: { user: { name: string } };
  patientUpdates: PatientUpdateRow[];
}

interface WeeklyReportDetailDialogProps {
  reportId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function WeeklyReportDetailDialog({
  reportId,
  onOpenChange,
}: WeeklyReportDetailDialogProps) {
  const [report, setReport] = useState<WeeklyReportDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      return;
    }
    setLoading(true);
    fetch(`/api/weekly-reports/${reportId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: WeeklyReportDetail | null) => {
        setReport(data);
        setLoading(false);
      });
  }, [reportId]);

  return (
    <Dialog open={reportId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {report ? report.psychologist.user.name : "Reporte semanal"}
          </DialogTitle>
          <DialogDescription>
            {report && (
              <>
                <span className="capitalize">
                  {weekLabel(new Date(report.weekStartDate))}
                </span>{" "}
                · Enviado el{" "}
                {format(new Date(report.submittedAt), "d MMM yyyy, h:mm a", {
                  locale: es,
                })}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading || !report ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Cargando…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 rounded-md border p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Horas de atención</p>
                <p className="font-medium">{report.hoursOfAttention}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pacientes activos</p>
                <p className="font-medium">{report.activePatientCount}</p>
              </div>
            </div>

            {report.notes && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Notas</p>
                <p className="text-sm text-muted-foreground">{report.notes}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Estado de pacientes ({report.patientUpdates.length})
              </p>
              {report.patientUpdates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No se reportaron pacientes.
                </p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-2">
                  {report.patientUpdates.map((u) => {
                    const status =
                      u.serviceType === ServiceType.EVALUATION
                        ? u.evaluationStatus
                          ? evaluationStatusLabels[u.evaluationStatus]
                          : null
                        : u.therapyStatus
                          ? therapyStatusLabels[u.therapyStatus]
                          : null;
                    return (
                      <div
                        key={u.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-sm font-medium">
                          {u.patient.fullName}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">
                            {serviceTypeLabels[u.serviceType]}
                          </Badge>
                          {status && <Badge variant="outline">{status}</Badge>}
                          {u.patientType && (
                            <Badge variant="outline">
                              {patientTypeLabels[u.patientType]}
                            </Badge>
                          )}
                          {u.discountLevel && (
                            <Badge variant="outline">
                              {discountLevelLabels[u.discountLevel]}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
