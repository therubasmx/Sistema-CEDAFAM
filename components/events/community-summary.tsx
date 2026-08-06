"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ModuleEvent } from "@/components/events/event-module-view";

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

interface EventGroup {
  title: string;
  count: number;
  locations: string[];
  beneficiaries: number;
  hours: number;
}

function durationHours(startAt: string, endAt: string): number {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Resumen de Extensión a la Comunidad: horas y cantidad totales, más una dona
 * agrupada por nombre de evento (el tamaño de cada rebanada es cuántas veces
 * se impartió ese evento). Solo cuenta lo "Realizado" — un evento futuro
 * todavía no tiene horas ni asistencia que resumir.
 */
export function CommunitySummary() {
  const [events, setEvents] = useState<ModuleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calendar/events?kind=COMMUNITY")
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando resumen…</p>;
  }

  const past = events.filter((e) => new Date(e.endAt).getTime() < Date.now());
  if (past.length === 0) return null;

  const totalHours = past.reduce(
    (sum, e) => sum + durationHours(e.startAt, e.endAt),
    0,
  );

  const groups = Object.values(
    past.reduce<Record<string, EventGroup>>((acc, e) => {
      const g = (acc[e.title] ??= {
        title: e.title,
        count: 0,
        locations: [],
        beneficiaries: 0,
        hours: 0,
      });
      g.count += 1;
      if (e.location && !g.locations.includes(e.location)) {
        g.locations.push(e.location);
      }
      g.beneficiaries += e.beneficiaryCount ?? 0;
      g.hours += durationHours(e.startAt, e.endAt);
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Eventos realizados</CardDescription>
            <CardTitle className="text-2xl">{past.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Horas acumuladas</CardDescription>
            <CardTitle className="text-2xl">{round1(totalHours)} h</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos por nombre</CardTitle>
          <CardDescription>
            El tamaño de cada rebanada es cuántas veces se impartió.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={groups}
                dataKey="count"
                nameKey="title"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {groups.map((g, i) => (
                  <Cell key={g.title} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<GroupTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {groups.map((g, i) => (
              <div
                key={g.title}
                className="flex items-start gap-2 rounded-md border p-2 text-xs"
              >
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">{g.title}</p>
                  <p className="text-muted-foreground">
                    {g.count} vez{g.count === 1 ? "" : "es"} · {round1(g.hours)} h
                    {g.beneficiaries > 0 && ` · ${g.beneficiaries} beneficiados`}
                  </p>
                  {g.locations.length > 0 && (
                    <p className="text-muted-foreground">{g.locations.join(", ")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GroupTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: EventGroup }[];
}) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
      <p className="font-medium">{g.title}</p>
      <p>
        {g.count} vez{g.count === 1 ? "" : "es"} · {round1(g.hours)} h
      </p>
      {g.beneficiaries > 0 && <p>{g.beneficiaries} personas beneficiadas</p>}
      {g.locations.length > 0 && <p>{g.locations.join(", ")}</p>}
    </div>
  );
}
