"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { WeeklyReportForm } from "@/components/forms/weekly-report-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PendingState {
  pending: boolean;
  blocking: boolean;
  weekLabel?: string;
}

export default function WeeklyReportPage() {
  const router = useRouter();
  const [state, setState] = useState<PendingState | null>(null);

  useEffect(() => {
    fetch("/api/weekly-reports/pending")
      .then((r) => r.json())
      .then(setState);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reporte semanal</h1>
        <p className="text-muted-foreground">
          Obligatorio cada viernes antes de las 12:30 pm.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {state?.pending ? "Completar reporte" : "Reporte semanal"}
          </CardTitle>
          {state?.blocking && (
            <CardDescription className="text-destructive">
              Tienes un reporte vencido. Complétalo para mantener tu acceso.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {state === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : state.pending ? (
            <WeeklyReportForm
              weekLabel={state.weekLabel ?? "semana actual"}
              onSuccess={() => {
                setState({ pending: false, blocking: false });
                router.refresh();
              }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="font-medium">No tienes reportes pendientes.</p>
              <p className="text-sm text-muted-foreground">
                Vuelve el viernes para enviar el reporte de la semana.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
