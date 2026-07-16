"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays, subYears } from "date-fns";
import type { ReportData } from "@/lib/reports";
import { ExportDialog } from "@/components/reports/export-dialog";
import { Input } from "@/components/ui/input";
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

const AREA_COLORS = ["#3b82f6", "#f59e0b", "#10b981"];
const TYPE_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];

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
  const typeTotal = typeChart.reduce((a, s) => a + s.count, 0);

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
            <Stat title="Pacientes nuevos" value={data.totals.newPatients} />
            <Stat
              title="Tasa de deserción"
              value={`${data.dropout.rate}%`}
              hint={`${data.dropout.neverCame + data.dropout.voluntaryDischarge} de ${data.dropout.totalWithStatus} (nunca vino + alta voluntaria)`}
            />
            <Stat
              title="Duración prom. terapia"
              value={`${data.averageDuration.therapyMonths} meses`}
            />
            <Stat
              title="Duración prom. evaluación"
              value={`${data.averageDuration.evaluationWeeks} sem`}
            />
          </div>

          {/* New patients per period */}
          <Card>
            <CardHeader>
              <CardTitle>Pacientes nuevos por período</CardTitle>
              <CardDescription>Por área de servicio</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.newPatientsByPeriod}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="PSYCHOLOGY" stackId="a" fill="#3b82f6" name="Psicología" />
                  <Bar dataKey="PSYCHIATRY" stackId="a" fill="#f59e0b" name="Psiquiatría" />
                  <Bar
                    dataKey="PSYCHOLOGICAL_EVALUATION"
                    stackId="a"
                    fill="#10b981"
                    name="Evaluación"
                  />
                  <Bar
                    dataKey="NEUROPSYCHOLOGICAL"
                    stackId="a"
                    fill="#8b5cf6"
                    name="Neuropsicológica"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Therapy status */}
            <Card>
              <CardHeader>
                <CardTitle>Pacientes por estado (terapia)</CardTitle>
              </CardHeader>
              <CardContent>
                {therapyChart.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={therapyChart}
                        dataKey="count"
                        nameKey="label"
                        outerRadius={90}
                        label
                      >
                        {therapyChart.map((_, i) => (
                          <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Psychiatry status */}
            <Card>
              <CardHeader>
                <CardTitle>Pacientes por estado (psiquiatría)</CardTitle>
              </CardHeader>
              <CardContent>
                {psychiatryChart.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={psychiatryChart}
                        dataKey="count"
                        nameKey="label"
                        outerRadius={90}
                        label
                      >
                        {psychiatryChart.map((_, i) => (
                          <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Psychological evaluation status */}
            <Card>
              <CardHeader>
                <CardTitle>Pacientes por estado (Evaluación psicológica)</CardTitle>
              </CardHeader>
              <CardContent>
                {psychEvalChart.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={psychEvalChart}
                        dataKey="count"
                        nameKey="label"
                        outerRadius={90}
                        label
                      >
                        {psychEvalChart.map((_, i) => (
                          <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Neuropsychological evaluation status */}
            <Card>
              <CardHeader>
                <CardTitle>Pacientes por estado (Evaluación Neuropsicológica)</CardTitle>
              </CardHeader>
              <CardContent>
                {neuroEvalChart.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={neuroEvalChart}
                        dataKey="count"
                        nameKey="label"
                        outerRadius={90}
                        label
                      >
                        {neuroEvalChart.map((_, i) => (
                          <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Patients by type (tipo de px) */}
            <Card>
              <CardHeader>
                <CardTitle>Pacientes por tipo</CardTitle>
                <CardDescription>
                  Se actualiza con cada reporte semanal
                </CardDescription>
              </CardHeader>
              <CardContent>
                {typeChart.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={typeChart}
                          dataKey="count"
                          nameKey="label"
                          outerRadius={80}
                          label
                        >
                          {typeChart.map((_, i) => (
                            <Cell
                              key={i}
                              fill={TYPE_COLORS[i % TYPE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Px</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {typeChart.map((t) => (
                          <TableRow key={t.key}>
                            <TableCell>{t.label}</TableCell>
                            <TableCell className="text-right font-medium">
                              {t.count}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="font-medium">Total</TableCell>
                          <TableCell className="text-right font-medium">
                            {typeTotal}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

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
                          <TableCell className="max-w-xs truncate">{r.label}</TableCell>
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

function Stat({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
      )}
    </Card>
  );
}

function Empty() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      Aún no hay datos suficientes para este reporte.
    </p>
  );
}
