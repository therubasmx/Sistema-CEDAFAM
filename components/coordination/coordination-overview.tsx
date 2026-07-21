"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpRight } from "lucide-react";
import { Position } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coordinationHref } from "@/lib/nav";
import {
  positionDescriptions,
  positionLabels,
  positionShortLabels,
} from "@/lib/labels";
import type {
  ActivityTone,
  CoordinationSummary,
} from "@/lib/coordination-summary";
import { cn } from "@/lib/utils";

const ALL = "ALL";

const toneVariant: Record<ActivityTone, BadgeProps["variant"]> = {
  default: "secondary",
  success: "success",
  warning: "warning",
  destructive: "destructive",
};

/**
 * Panel de Coordinación Servicios de Atención Privada.
 *
 * Con "Todas" muestra una tarjeta por coordinación; al elegir una, su historial
 * completo. El Jefe Principal la ve igual, porque supervisa las seis.
 */
export function CoordinationOverview() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string>(ALL);
  const [summaries, setSummaries] = useState<CoordinationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const qs = query.toString();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/coordination-summary${qs ? `?${qs}` : ""}`);
    if (res.ok) setSummaries(await res.json());
    setLoading(false);
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const visible =
    selected === ALL
      ? summaries
      : summaries.filter((s) => s.position === selected);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="co-from">Desde</Label>
            <Input
              id="co-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-to">Hasta</Label>
            <Input
              id="co-to"
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
          {!from && !to && (
            <p className="pb-2 text-sm text-muted-foreground">
              Mostrando todo el histórico.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Selector de coordinación */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={selected === ALL}
          onClick={() => setSelected(ALL)}
          label="Todas"
        />
        {summaries.map((s) => (
          <FilterChip
            key={s.position}
            active={selected === s.position}
            onClick={() => setSelected(s.position)}
            label={positionShortLabels[s.position]}
          />
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div
          className={cn(
            "grid gap-6",
            selected === ALL && "lg:grid-cols-2",
          )}
        >
          {visible.map((s) => (
            <SummaryCard
              key={s.position}
              summary={s}
              expanded={selected !== ALL}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </button>
  );
}

function SummaryCard({
  summary,
  expanded,
}: {
  summary: CoordinationSummary;
  expanded: boolean;
}) {
  const position = summary.position as Position;
  // En la vista de conjunto se recortan los renglones; al elegir una
  // coordinación se muestra su historial completo.
  const items = expanded ? summary.activity : summary.activity.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {positionLabels[position]}
            </CardTitle>
            <CardDescription>{positionDescriptions[position]}</CardDescription>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href={coordinationHref(position)} title="Abrir el módulo">
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cifras */}
        <div className="flex flex-wrap gap-4">
          {summary.stats.map((stat) => (
            <div key={stat.label} className="min-w-[7rem]">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-semibold">{stat.value}</p>
              {stat.hint && (
                <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
              )}
            </div>
          ))}
        </div>

        {/* Actividad */}
        <div className="space-y-2 border-t pt-3">
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sin actividad en este periodo.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.title}</p>
                  {item.detail && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.status && (
                    <Badge variant={toneVariant[item.tone ?? "default"]}>
                      {item.status}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(item.when), "d MMM", { locale: es })}
                  </span>
                </div>
              </div>
            ))
          )}
          {!expanded && summary.activity.length > items.length && (
            <p className="pt-1 text-xs text-muted-foreground">
              +{summary.activity.length - items.length} más
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
