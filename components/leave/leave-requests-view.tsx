"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LeaveStatus, LeaveUnit, Speciality, LeaveProgram } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  leaveProgramLabels,
  leaveStatusLabels,
  leaveUnitLabels,
  specialityLabels,
} from "@/lib/labels";
import { leaveRangeLabel } from "@/lib/leave";
import { cn } from "@/lib/utils";

interface LeaveRow {
  id: string;
  requestedAt: string;
  area: Speciality;
  program: LeaveProgram;
  unit: LeaveUnit;
  quantity: number;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  status: LeaveStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  psychologist: {
    id: string;
    speciality: Speciality;
    user: { name: string; email: string };
  };
  reviewedBy: { name: string } | null;
}

interface Summary {
  year: number;
  availableYears: number[];
  totals: { pending: number; approved: number; rejected: number };
  byMonth: { month: string; pending: number; approved: number; rejected: number }[];
  byPsychologist: {
    psychologistId: string;
    name: string;
    pending: number;
    approved: number;
    rejected: number;
    approvedHours: number;
    approvedDays: number;
  }[];
}

const statusVariant: Record<LeaveStatus, BadgeProps["variant"]> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

const TABS: { key: LeaveStatus; label: string }[] = [
  { key: LeaveStatus.PENDING, label: "Pendientes" },
  { key: LeaveStatus.APPROVED, label: "Aceptadas" },
  { key: LeaveStatus.REJECTED, label: "Rechazadas" },
];

/** Convierte las fechas ISO de la API al shape que espera `leaveRangeLabel`. */
function rangeOf(r: LeaveRow) {
  return leaveRangeLabel({
    unit: r.unit,
    startDate: new Date(r.startDate),
    endDate: new Date(r.endDate),
    startTime: r.startTime,
    endTime: r.endTime,
  });
}

export function LeaveRequestsView() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState<LeaveStatus>(LeaveStatus.PENDING);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<LeaveRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [listRes, sumRes] = await Promise.all([
      fetch("/api/leave-requests"),
      fetch(`/api/leave-requests/summary?year=${year}`),
    ]);
    if (listRes.ok) setRequests(await listRes.json());
    if (sumRes.ok) setSummary(await sumRes.json());
    setLoading(false);
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(
    leave: LeaveRow,
    decision: "APPROVE" | "REJECT",
    note?: string,
  ) {
    const res = await fetch(`/api/leave-requests/${leave.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo resolver",
        description: d.error,
        variant: "destructive",
      });
      return;
    }

    const data = await res.json().catch(() => ({ clashingAppointments: 0 }));
    const clashing: number = data.clashingAppointments ?? 0;

    if (decision === "APPROVE" && clashing > 0) {
      // El bloqueo no cancela lo ya agendado, así que hay que decirlo: alguien
      // tiene que reprogramar a esos pacientes.
      toast({
        title: "Permiso aceptado, pero hay citas en ese horario",
        description: `${clashing} cita${clashing === 1 ? "" : "s"} ya agendada${clashing === 1 ? "" : "s"} en ese rango. El bloqueo impide agendar más, pero esas hay que reprogramarlas.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: decision === "APPROVE" ? "Permiso aceptado" : "Permiso rechazado",
        description:
          decision === "APPROVE"
            ? "Su agenda queda bloqueada en ese horario."
            : undefined,
        variant: "success",
      });
    }
    setRejecting(null);
    load();
  }

  const visible = requests.filter((r) => r.status === tab);
  const chart = summary?.byMonth.filter(
    (m) => m.pending + m.approved + m.rejected > 0,
  );

  return (
    <div className="space-y-6">
      {/* Conteos */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Pendientes por revisar"
          value={summary?.totals.pending ?? 0}
          highlight={(summary?.totals.pending ?? 0) > 0}
        />
        <Stat label="Aceptadas" value={summary?.totals.approved ?? 0} />
        <Stat label="Rechazadas" value={summary?.totals.rejected ?? 0} />
      </div>

      {/* Resumen anual */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Permisos por mes</CardTitle>
            <CardDescription>
              Solicitudes según el mes de la ausencia.
            </CardDescription>
          </div>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(summary?.availableYears ?? [year]).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!chart || chart.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pendientes" />
                <Bar dataKey="approved" stackId="a" fill="#10b981" name="Aceptadas" />
                <Bar dataKey="rejected" stackId="a" fill="#ef4444" name="Rechazadas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Acumulado por psicólogo */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen por psicólogo — {year}</CardTitle>
          <CardDescription>
            Cuánto permiso ha pedido y obtenido cada quien en el año.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Psicólogo</TableHead>
                <TableHead className="text-right">Pendientes</TableHead>
                <TableHead className="text-right">Aceptadas</TableHead>
                <TableHead className="text-right">Rechazadas</TableHead>
                <TableHead className="text-right">Tiempo aceptado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!summary || summary.byPsychologist.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Sin permisos registrados en {year}.
                  </TableCell>
                </TableRow>
              ) : (
                summary.byPsychologist.map((p) => (
                  <TableRow key={p.psychologistId}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.pending}</TableCell>
                    <TableCell className="text-right">{p.approved}</TableCell>
                    <TableCell className="text-right">{p.rejected}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {[
                        p.approvedHours ? `${p.approvedHours} h` : null,
                        p.approvedDays ? `${p.approvedDays} d` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Historial */}
      <div className="space-y-3">
        <div className="inline-flex rounded-md border p-0.5">
          {TABS.map((t) => {
            const n = requests.filter((r) => r.status === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label} ({n})
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
            No hay solicitudes {leaveStatusLabels[tab].toLowerCase()}s.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold">{r.psychologist.user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {specialityLabels[r.area]} ·{" "}
                        {leaveProgramLabels[r.program]}
                      </p>
                    </div>
                    <Badge variant={statusVariant[r.status]}>
                      {leaveStatusLabels[r.status]}
                    </Badge>
                  </div>

                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Field label="Ausencia" value={rangeOf(r)} />
                    <Field
                      label="Cantidad"
                      value={`${r.quantity} ${leaveUnitLabels[r.unit].toLowerCase()}`}
                    />
                    <Field
                      label="Solicitado"
                      value={format(new Date(r.requestedAt), "d 'de' MMMM yyyy", {
                        locale: es,
                      })}
                    />
                    {r.reviewedAt && (
                      <Field
                        label="Resuelto"
                        value={`${format(new Date(r.reviewedAt), "d 'de' MMMM yyyy", { locale: es })}${r.reviewedBy ? ` · ${r.reviewedBy.name}` : ""}`}
                      />
                    )}
                  </dl>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Motivo
                    </p>
                    <p className="text-sm">{r.reason}</p>
                  </div>

                  {r.reviewNote && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                      <p className="text-xs font-medium text-destructive">
                        Motivo del rechazo
                      </p>
                      <p className="text-sm">{r.reviewNote}</p>
                    </div>
                  )}

                  {r.status !== LeaveStatus.APPROVED && (
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRejecting(r)}
                      >
                        <X className="h-4 w-4" /> Rechazar
                      </Button>
                      <Button size="sm" onClick={() => review(r, "APPROVE")}>
                        <Check className="h-4 w-4" /> Aceptar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <RejectDialog
        leave={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(note) => rejecting && review(rejecting, "REJECT", note)}
      />
    </div>
  );
}

/* ───────────────────────── Rechazo ───────────────────────── */

function RejectDialog({
  leave,
  onClose,
  onConfirm,
}: {
  leave: LeaveRow | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (leave) setNote("");
  }, [leave]);

  return (
    <Dialog open={!!leave} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar permiso</DialogTitle>
          <DialogDescription>
            {leave?.psychologist.user.name} verá este motivo en su notificación.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explica por qué no se autoriza el permiso."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={note.trim().length === 0}
              onClick={() => onConfirm(note.trim())}
            >
              Rechazar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Auxiliares ───────────────────────── */

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-amber-500/60")}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      Aún no hay datos suficientes para este reporte.
    </p>
  );
}
