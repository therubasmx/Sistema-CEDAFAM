"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WeeklyReportForm } from "@/components/forms/weekly-report-form";

interface PendingState {
  blocking: boolean;
  weekLabel?: string;
}

/**
 * Mounted in the dashboard layout. If the logged-in psychologist has an overdue
 * weekly report, it shows a non-dismissible modal (no close button, ignores
 * Escape and outside clicks) that must be completed before using the app.
 * No-op for non-psychologists — the API returns `blocking: false`.
 */
export function WeeklyReportGate() {
  const router = useRouter();
  const [state, setState] = useState<PendingState | null>(null);

  useEffect(() => {
    fetch("/api/weekly-reports/pending")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ blocking: false }));
  }, []);

  if (!state?.blocking) return null;

  return (
    <Dialog open>
      <DialogContent
        hideClose
        className="max-w-2xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reporte semanal pendiente
          </DialogTitle>
          <DialogDescription>
            No completaste el reporte de la {state.weekLabel}. Debes enviarlo
            para continuar usando el sistema.
          </DialogDescription>
        </DialogHeader>
        <WeeklyReportForm
          weekLabel={state.weekLabel ?? "semana anterior"}
          onSuccess={() => {
            setState({ blocking: false });
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
