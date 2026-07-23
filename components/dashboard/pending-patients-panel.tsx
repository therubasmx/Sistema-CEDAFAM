"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PartyPopper, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignDialog } from "@/components/assignments/assign-dialog";
import {
  PatientDetailDialog,
  type PendingPatient,
} from "@/components/dashboard/patient-detail-dialog";
import { serviceAreaLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const VISIBLE_ROWS = 5;

const HOUR_MS = 1000 * 60 * 60;

/** Urgency by wait time: red >48h, amber >24h, neutral otherwise. */
function urgency(createdAt: string): { dot: string; label: string } {
  const hours = (Date.now() - new Date(createdAt).getTime()) / HOUR_MS;
  if (hours >= 48) return { dot: "bg-red-500", label: "Urgente" };
  if (hours >= 24) return { dot: "bg-amber-500", label: "Espera >24h" };
  return { dot: "bg-muted-foreground/40", label: "" };
}

interface PendingPatientsPanelProps {
  canAssign: boolean;
}

export function PendingPatientsPanel({ canAssign }: PendingPatientsPanelProps) {
  const [rows, setRows] = useState<PendingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState<PendingPatient | null>(null);
  const [assignTarget, setAssignTarget] = useState<PendingPatient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Oldest first (createdAt_asc is the API default) so longest-waiting show up top.
    const res = await fetch("/api/patients?unassigned=true");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  // Load on mount + lightweight 60s polling so new intake forms surface
  // without a manual reload (same approach as the notification bell).
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const visible = rows.slice(0, VISIBLE_ROWS);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <UserPlus className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <CardTitle>Pacientes por asignar</CardTitle>
            <CardDescription>
              Formularios recibidos pendientes de asignación.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Cargando…
            </p>
          ) : rows.length === 0 ? (
            <p className="flex items-center justify-center gap-1.5 py-4 text-center text-sm text-muted-foreground">
              <PartyPopper className="h-4 w-4" />
              No hay pacientes pendientes de asignación.
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((p) => {
                const u = urgency(p.createdAt);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <button
                      onClick={() => setDetailTarget(p)}
                      className="flex min-w-0 items-center gap-2 rounded text-left transition-colors hover:text-primary"
                    >
                      <span
                        className={cn("h-2 w-2 shrink-0 rounded-full", u.dot)}
                        title={u.label || undefined}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:underline">
                          {p.fullName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {serviceAreaLabels[p.serviceArea]} · Recibido{" "}
                          {format(new Date(p.createdAt), "d MMM", { locale: es })}
                          {u.label && ` · ${u.label}`}
                        </span>
                      </span>
                    </button>
                    {canAssign && (
                      <Button size="sm" onClick={() => setAssignTarget(p)}>
                        Asignar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {rows.length > VISIBLE_ROWS && (
            <div className="pt-3 text-center">
              <Link
                href="/dashboard/assignments"
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver todas ({rows.length})
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {detailTarget && (
        <PatientDetailDialog
          patient={detailTarget}
          open={!!detailTarget}
          onOpenChange={(o) => !o && setDetailTarget(null)}
          canAssign={canAssign}
          onAssign={() => {
            setAssignTarget(detailTarget);
            setDetailTarget(null);
          }}
        />
      )}

      {assignTarget && (
        <AssignDialog
          patientId={assignTarget.id}
          patientName={assignTarget.fullName}
          open={!!assignTarget}
          onOpenChange={(o) => !o && setAssignTarget(null)}
          onAssigned={load}
        />
      )}
    </>
  );
}
