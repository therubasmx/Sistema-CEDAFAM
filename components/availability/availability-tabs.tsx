"use client";

import { useState } from "react";
import { Clock, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PsychologistsAvailabilityOverview } from "@/components/availability/psychologists-availability-overview";
import { WeeklyReportsHistory } from "@/components/availability/weekly-reports-history";

type Tab = "overview" | "history";

const TABS: { value: Tab; label: string; icon: typeof Clock }[] = [
  { value: "overview", label: "Horarios por psicólogo", icon: Clock },
  { value: "history", label: "Historial de reportes", icon: History },
];

export function AvailabilityTabs() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <Card>
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Horarios por psicólogo</CardTitle>
              <CardDescription>
                Los bloques marcados corresponden a los horarios que cada
                psicólogo declaró disponibles en su último reporte semanal.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PsychologistsAvailabilityOverview />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Historial de reportes semanales</CardTitle>
              <CardDescription>
                Todos los reportes enviados por cada psicólogo, con fecha de
                envío, para verificar cumplimiento semana a semana.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <WeeklyReportsHistory />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
