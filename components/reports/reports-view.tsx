"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays, subYears } from "date-fns";
import { ClipboardList, TrendingDown, Timer, UserPlus, type LucideIcon } from "lucide-react";
import type { ReportData, CountRow } from "@/lib/reports";
import { ExportDialog } from "@/components/reports/export-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const AREA_COLORS: Record<string, string> = {
  PSYCHOLOGY: "#3b82f6",
  PSYCHIATRY: "#f59e0b",
  PSYCHOLOGICAL_EVALUATION: "#10b981",
  NEUROPSYCHOLOGICAL: "#8b5cf6",
};

// Colores por significado, no por posición: un estado siempre se ve igual,
// tenga o no otros estados con conteo 0 en ese rango de fechas.
const THERAPY_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#3b82f6", // en curso
  THERAPEUTIC_DISCHARGE: "#10b981", // buen desenlace
  VOLUNTARY_DISCHARGE: "#f59e0b", // salida anticipada
  NEVER_CAME: "#ef4444", // abandono
  REFERRED: "#8b5cf6",
  CANCELLED: "#64748b",
};

const EVALUATION_STATUS_COLORS: Record<string, string> = {
  WAITLIST: "#3b82f6",
  TEST_APPLICATION: "#06b6d4",
  REPORT_PREPARATION: "#f59e0b",
  EVALUATION_COMPLETED: "#10b981",
  REFERRAL: "#8b5cf6",
  CANCELLED: "#64748b",
};

const TYPE_COLORS: Record<string, string> = {
  PARTICULAR: "#3b82f6",
  UM_EMPLOYEE: "#10b981",
  HLC_EMPLOYEE: "#f59e0b",
  UM_STUDENT: "#8b5cf6",
  SIERE: "#06b6d4",
};

type Preset = "7d" | "30d" | "90d" | "1y" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  "1y": "Último año",
  custom: "Personalizado",
};

function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function presetRange(preset: Exclude<Preset, "custom">): { start: string; end: string } {
  const today = new Date();
  const startByPreset: Record<Exclude<Preset, "custom">, Date> = {
    "7d": subDays(today, 6),
    "30d": subDays(today, 29),
    "90d": subDays(today, 89),
    "1y": subYears(today, 1),
  };
  return { start: toISODate(startByPreset[preset]), end: toISODate(today) };
}

export function ReportsView() {
  const [preset, setPreset] = useState<Preset>("1y");
  const initialRange = presetRange("1y");
  const [customStart, setCustomStart] = useState(initialRange.start);
  const [customEnd, setCustomEnd] = useState(initialRange.end);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (preset === "custom") return { start: customStart, end: customEnd };
    return presetRange(preset);
  }, [preset, customStart, customEnd]);

  const rangeValid = Boolean(range.start && range.end && range.start <= range.end);

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    const res = await fetch(`/api/reports?start=${start}&end=${end}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (rangeValid) load(range.start, range.end);
  }, [range, rangeValid, load]);

  const therapyChart =
    data?.patientsByTherapyStatus.filter((s) => s.count > 0) ?? [];
  const psychiatryChart =
    data?.patientsByPsychiatryStatus.filter((s) => s.count > 0) ?? [];
  const psychEvalChart =
    data?.patientsByPsychEvaluationStatus.filter((s) => s.count > 0) ?? [];
  const neuroEvalChart =
    data?.patientsByNeuroEvaluationStatus.filter((s) => s.count > 0) ?? [];
  const typeChart = data?.patientsByType.filter((s) => s.count > 0) ?? [];
  const maxReasonCount = Math.max(1, ...(data?.topReasons.map((r) => r.count) ?? [1]));

  const dropoutTone: Tone =
    (data?.dropout.rate ?? 0) <= 15
      ? "success"
      : (data?.dropout.rate ?? 0) <= 30
        ? "warning"
        : "destructive";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRESET_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-40"
                value={customStart}
                max={customEnd || undefined}
                min={data?.earliestPatientDate ?? undefined}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">a</span>
              <Input
                type="date"
                className="w-40"
                value={customEnd}
                min={customStart || undefined}
                max={toISODate(new Date())}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          )}
        </div>

        {rangeValid && <ExportDialog start={range.start} end={range.end} />}
      </div>

      {!rangeValid ? (
        <p className="text-sm text-muted-foreground">
          La fecha de inicio debe ser anterior o igual a la fecha final.
        </p>
      ) : loading || !data ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Pacientes nuevos" value={data.totals.newPatients} icon={UserPlus} />
            <Stat
              title="Tasa de deserción"
              value={`${data.dropout.rate}%`}
              hint={`${data.dropout.neverCame + data.dropout.voluntaryDischarge} de ${data.dropout.totalWithStatus} (nunca vino + alta voluntaria)`}
              icon={TrendingDown}
              tone={dropoutTone}
            />
            <Stat
              title="Duración prom. terapia"
              value={`${data.averageDuration.therapyMonths} meses`}
              icon={Timer}
            />
            <Stat
              title="Duración prom. evaluación"
              value={`${data.averageDuration.evaluationWeeks} sem`}
              icon={ClipboardList}
            />
          </div>

          {/* New patients per period */}
          <Card>
            <CardHeader>
              <CardTitle>Pacientes nuevos por período</CardTitle>
              <CardDescription>Por área de servicio</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.newPatientsByPeriod} margin={{ top: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PeriodTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                  />
                  <Bar dataKey="PSYCHOLOGY" stackId="a" fill={AREA_COLORS.PSYCHOLOGY} name="Psicología" />
                  <Bar
                    dataKey="PSYCHIATRY"
                    stackId="a"
                    fill={AREA_COLORS.PSYCHIATRY}
                    name="Psiquiatría"
                  />
                  <Bar
                    dataKey="PSYCHOLOGICAL_EVALUATION"
                    stackId="a"
                    fill={AREA_COLORS.PSYCHOLOGICAL_EVALUATION}
                    name="Evaluación"
                  />
                  <Bar
                    dataKey="NEUROPSYCHOLOGICAL"
                    stackId="a"
                    fill={AREA_COLORS.NEUROPSYCHOLOGICAL}
                    name="Neuropsicológica"
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList
                      dataKey="total"
                      position="top"
                      style={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <StatusDonut
              title="Pacientes por estado (terapia)"
              data={therapyChart}
              colors={THERAPY_STATUS_COLORS}
            />
            <StatusDonut
              title="Pacientes por estado (psiquiatría)"
              data={psychiatryChart}
              colors={THERAPY_STATUS_COLORS}
            />
            <StatusDonut
              title="Pacientes por estado (Evaluación psicológica)"
              data={psychEvalChart}
              colors={EVALUATION_STATUS_COLORS}
            />
            <StatusDonut
              title="Pacientes por estado (Evaluación Neuropsicológica)"
              data={neuroEvalChart}
              colors={EVALUATION_STATUS_COLORS}
            />
            <StatusDonut
              title="Pacientes por tipo"
              description="Se actualiza con cada reporte semanal"
              data={typeChart}
              colors={TYPE_COLORS}
              countLabel="Px"
            />

            {/* Top reasons */}
            <Card>
              <CardHeader>
                <CardTitle>Motivos de consulta frecuentes</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topReasons.length === 0 ? (
                  <Empty />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motivo</TableHead>
                        <TableHead className="text-right">Veces</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topReasons.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell className="max-w-xs">
                            <span className="mb-1 block truncate">{r.label}</span>
                            <div className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${(r.count / maxReasonCount) * 100}%` }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {r.count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

type Tone = "default" | "success" | "warning" | "destructive";

const TONE_CLASSES: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  destructive: "bg-red-500/10 text-red-500",
};

function Stat({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-2xl">{value}</CardTitle>
        </div>
        <span className={cn("rounded-md p-2", TONE_CLASSES[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
      )}
    </Card>
  );
}

/** Dona con total al centro + tabla accesible (conteo y %) — reemplaza el pie plano con labels flotantes. */
function StatusDonut({
  title,
  description,
  data,
  colors,
  countLabel = "Pacientes",
}: {
  title: string;
  description?: string;
  data: CountRow[];
  colors: Record<string, string>;
  countLabel?: string;
}) {
  const total = data.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-[200px] w-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {data.map((d) => (
                      <Cell key={d.key} fill={colors[d.key] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip total={total} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold leading-none">{total}</span>
                <span className="text-xs text-muted-foreground">{countLabel}</span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">{countLabel}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.key}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colors[d.key] ?? "#94a3b8" }}
                        />
                        {d.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {d.count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {total ? Math.round((d.count / total) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value ?? 0;
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{payload[0].name}</p>
      <p className="text-muted-foreground">
        {value} · {pct}%
      </p>
    </div>
  );
}

function PeriodTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  return (
    <div className="min-w-40 rounded-lg border bg-popover p-3 text-sm shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums font-medium text-popover-foreground">{p.value}</span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5 font-medium text-popover-foreground">
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      Aún no hay datos suficientes para este reporte.
    </p>
  );
}
