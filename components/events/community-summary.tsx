"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
import type { ModuleEvent } from "@/components/events/event-module-view";
import { AGE_RANGE_KEYS, type AgeRangeKey } from "@/lib/validators";
import { ageRangeLabels } from "@/lib/labels";

const AGE_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
];
const SEX_COLORS = { women: "#ec4899", men: "#3b82f6" };

/** Radix no acepta value="" en un SelectItem, así que los lugares vacíos y la
 * opción de "ver todo" llevan etiquetas propias. */
const ALL_PLACES = "Todos los lugares";
const NO_PLACE = "Sin lugar";

function placeOf(e: ModuleEvent): string {
  return e.location?.trim() || NO_PLACE;
}

interface EventGroup {
  title: string;
  location: string;
  count: number;
  beneficiaries: number;
  hours: number;
  women: number;
  men: number;
  ageCounts: Record<AgeRangeKey, number>;
}

function durationHours(startAt: string, endAt: string): number {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function emptyAgeCounts(): Record<AgeRangeKey, number> {
  return Object.fromEntries(AGE_RANGE_KEYS.map((k) => [k, 0])) as Record<
    AgeRangeKey,
    number
  >;
}

/**
 * Resumen de Extensión a la Comunidad: horas y cantidad totales, más una
 * tarjeta por cada combinación de nombre de evento y lugar (se van agregando
 * solas conforme aparecen nombres o lugares nuevos) con su propia dona de sexo
 * y de rango de edad. El mismo evento en dos lugares son dos tarjetas, para
 * poder leer la asistencia de cada comunidad por separado, y el desplegable
 * de lugar deja ver el resumen completo de una sola comunidad. Solo cuenta lo
 * "Realizado" — un evento futuro todavía no tiene horas ni asistencia que
 * resumir.
 */
export function CommunitySummary() {
  const [events, setEvents] = useState<ModuleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState(ALL_PLACES);

  useEffect(() => {
    fetch("/api/calendar/events?kind=COMMUNITY")
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando resumen…</p>;
  }

  const allPast = events.filter((e) => new Date(e.endAt).getTime() < Date.now());
  if (allPast.length === 0) return null;

  const places = [...new Set(allPast.map(placeOf))].sort((a, b) =>
    a.localeCompare(b),
  );
  // Si el lugar elegido ya no existe (se borró o editó el evento) se vuelve a
  // mostrar todo, en vez de dejar el resumen vacío.
  const selected = places.includes(place) ? place : ALL_PLACES;
  const past =
    selected === ALL_PLACES
      ? allPast
      : allPast.filter((e) => placeOf(e) === selected);

  const totalHours = past.reduce(
    (sum, e) => sum + durationHours(e.startAt, e.endAt),
    0,
  );

  const groups = Object.values(
    past.reduce<Record<string, EventGroup>>((acc, e) => {
      const location = placeOf(e) === NO_PLACE ? "" : placeOf(e);
      const g = (acc[`${e.title} · ${location}`] ??= {
        title: e.title,
        location,
        count: 0,
        beneficiaries: 0,
        hours: 0,
        women: 0,
        men: 0,
        ageCounts: emptyAgeCounts(),
      });
      g.count += 1;
      g.beneficiaries += e.beneficiaryCount ?? 0;
      g.hours += durationHours(e.startAt, e.endAt);
      g.women += e.womenCount ?? 0;
      g.men += e.menCount ?? 0;
      for (const k of AGE_RANGE_KEYS) {
        g.ageCounts[k] += e.ageRanges?.[k] ?? 0;
      }
      return acc;
    }, {}),
  );

  // Los lugares del mismo evento quedan juntos, y los eventos más frecuentes
  // (sumando todos sus lugares) van primero.
  const countByTitle = groups.reduce<Record<string, number>>((acc, g) => {
    acc[g.title] = (acc[g.title] ?? 0) + g.count;
    return acc;
  }, {});
  groups.sort(
    (a, b) =>
      countByTitle[b.title] - countByTitle[a.title] ||
      a.title.localeCompare(b.title) ||
      b.count - a.count ||
      a.location.localeCompare(b.location),
  );

  return (
    <div className="space-y-4">
      {places.length > 1 && (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Select value={selected} onValueChange={setPlace}>
            <SelectTrigger className="h-9 w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PLACES}>{ALL_PLACES}</SelectItem>
              {places.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <Card key={`${g.title} · ${g.location}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{g.title}</CardTitle>
              <CardDescription>
                {g.count} {g.count === 1 ? "vez" : "veces"} · {round1(g.hours)} h
                {g.location && ` · ${g.location}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.beneficiaries > 0 && (
                <p className="text-sm">
                  <span className="font-medium">{g.beneficiaries}</span>{" "}
                  {g.beneficiaries === 1
                    ? "persona beneficiada"
                    : "personas beneficiadas"}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Sexo
                  </p>
                  <MiniDonut
                    data={[
                      { name: "Mujeres", value: g.women, color: SEX_COLORS.women },
                      { name: "Hombres", value: g.men, color: SEX_COLORS.men },
                    ]}
                    emptyLabel="Sin datos de sexo"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Edades
                  </p>
                  <MiniDonut
                    data={AGE_RANGE_KEYS.map((k, i) => ({
                      name: ageRangeLabels[k],
                      value: g.ageCounts[k],
                      color: AGE_COLORS[i % AGE_COLORS.length],
                    }))}
                    emptyLabel="Sin datos de edad"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

function MiniDonut({
  data,
  emptyLabel,
}: {
  data: DonutSlice[];
  emptyLabel: string;
}) {
  const nonZero = data.filter((d) => d.value > 0);
  if (nonZero.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie
            data={nonZero}
            dataKey="value"
            nameKey="name"
            innerRadius={28}
            outerRadius={48}
            paddingAngle={2}
          >
            {nonZero.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<MiniTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 space-y-0.5">
        {nonZero.map((d) => (
          <div
            key={d.name}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="font-medium text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DonutSlice }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
      {d.name}: {d.value}
    </div>
  );
}
