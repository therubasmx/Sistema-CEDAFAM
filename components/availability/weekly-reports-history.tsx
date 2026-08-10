"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { weekLabel } from "@/lib/week";
import { WeeklyReportDetailDialog } from "@/components/availability/weekly-report-detail-dialog";

interface WeeklyReportRow {
  id: string;
  weekStartDate: string;
  submittedAt: string;
  hoursOfAttention: number;
  activePatientCount: number;
  notes: string | null;
  psychologist: { user: { name: string } };
  _count: { patientUpdates: number };
}

export function WeeklyReportsHistory() {
  const [reports, setReports] = useState<WeeklyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/weekly-reports")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WeeklyReportRow[]) => {
        setReports(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay reportes semanales registrados.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Psicólogo</TableHead>
              <TableHead>Semana reportada</TableHead>
              <TableHead>Fecha de envío</TableHead>
              <TableHead>Horas de atención</TableHead>
              <TableHead>Pacientes activos</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    onClick={() => setSelectedReportId(r.id)}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.psychologist.user.name}
                  </button>
                </TableCell>
                <TableCell className="capitalize">
                  {weekLabel(new Date(r.weekStartDate))}
                </TableCell>
                <TableCell>
                  {format(new Date(r.submittedAt), "d MMM yyyy, h:mm a", {
                    locale: es,
                  })}
                </TableCell>
                <TableCell>{r.hoursOfAttention}</TableCell>
                <TableCell>{r.activePatientCount}</TableCell>
                <TableCell className="max-w-[240px] truncate text-muted-foreground">
                  {r.notes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <WeeklyReportDetailDialog
        reportId={selectedReportId}
        onOpenChange={(open) => !open && setSelectedReportId(null)}
      />
    </>
  );
}
