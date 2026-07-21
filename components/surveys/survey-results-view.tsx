"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Link2 } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { SurveyReport } from "@/lib/survey-report";

/** Etiqueta cualitativa del promedio 1–3, para no dejar el número solo. */
function satisfactionLabel(score: number): string {
  if (score >= 2.6) return "Muy satisfechos";
  if (score >= 2.0) return "Satisfechos";
  if (score >= 1.5) return "Con reservas";
  return "Insatisfechos";
}

export function SurveyResultsView() {
  const { toast } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<SurveyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const qs = query.toString();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/surveys${qs ? `?${qs}` : ""}`);
    if (res.ok) setReport(await res.json());
    setLoading(false);
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyPublicLink() {
    const url = `${window.location.origin}/encuesta`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Liga copiada", description: url, variant: "success" });
    } catch {
      // El navegador puede bloquear el portapapeles sin gesto directo.
      toast({ title: "Liga de la encuesta", description: url });
    }
  }

  const empty = !loading && (report?.totalResponses ?? 0) === 0;

  return (
    <div className="space-y-6">
      {/* Filtros y acciones */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="sv-from">Desde</Label>
            <Input
              id="sv-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sv-to">Hasta</Label>
            <Input
              id="sv-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Limpiar
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyPublicLink}>
              <Link2 className="h-4 w-4" /> Copiar liga
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/surveys/export${qs ? `?${qs}` : ""}`}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totales */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Respuestas recibidas</CardDescription>
            <CardTitle className="text-2xl">
              {report?.totalResponses ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Satisfacción promedio</CardDescription>
            <CardTitle className="text-2xl">
              {report?.overallSatisfaction != null
                ? `${report.overallSatisfaction} / 3`
                : "—"}
            </CardTitle>
            {report?.overallSatisfaction != null && (
              <p className="text-sm text-muted-foreground">
                {satisfactionLabel(report.overallSatisfaction)}
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : empty ? (
        <div className="rounded-md border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Todavía no hay respuestas</p>
          <p className="text-sm text-muted-foreground">
            {from || to
              ? "Prueba con otro rango de fechas."
              : "Comparte la liga de la encuesta para empezar a recibirlas."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {report?.questions.map((q, i) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {i + 1}. {q.text}
                </CardTitle>
                <CardDescription>
                  {q.answered} respuesta{q.answered === 1 ? "" : "s"}
                  {q.averageScore != null && ` · promedio ${q.averageScore} / 3`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {q.answered === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sin respuestas en este periodo.
                  </p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={q.options}>
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip
                          formatter={(value: number, _n, item) => [
                            `${value} (${item.payload.percent}%)`,
                            "Respuestas",
                          ]}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {q.options.map((o) => (
                            <Cell key={o.value} fill={o.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {q.options.map((o) => (
                        <span key={o.value} className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: o.color }}
                            aria-hidden
                          />
                          {o.label}: {o.count} ({o.percent}%)
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
