"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Download, FileSpreadsheet } from "lucide-react";
import type { AnnualReport } from "@/lib/reports";
import { Button } from "@/components/ui/button";
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

export function ReportsView() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<AnnualReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    const res = await fetch(`/api/reports/annual?year=${y}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load(year);
  }, [year, load]);

  const therapyChart =
    data?.patientsByTherapyStatus.filter((s) => s.count > 0) ?? [];
  const typeChart = data?.patientsByType.filter((s) => s.count > 0) ?? [];
  const typeTotal = typeChart.reduce((a, s) => a + s.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={String(year)}
          onValueChange={(v) => setYear(Number(v))}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(data?.availableYears ?? [year]).map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/reports/annual/export?year=${year}&format=xlsx`}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/reports/annual/export?year=${year}&format=pdf`}>
              <Download className="h-4 w-4" /> PDF
            </a>
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Pacientes nuevos" value={data.totals.newPatients} />
            <Stat
              title="Tasa de deserción"
              value={`${data.dropout.rate}%`}
              hint={`${data.dropout.neverCame} de ${data.dropout.totalWithStatus}`}
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

          {/* New patients per month */}
          <Card>
            <CardHeader>
              <CardTitle>Pacientes nuevos por mes</CardTitle>
              <CardDescription>Por área de servicio</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.newPatientsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
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
