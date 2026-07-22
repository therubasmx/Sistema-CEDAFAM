"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { positionShortLabels } from "@/lib/labels";
import type { CoordinationSummary } from "@/lib/coordination-summary";
import { CoordinationSummaryCard } from "@/components/coordination/coordination-summary-card";
import { cn } from "@/lib/utils";

const ALL = "ALL";

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
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas</SelectItem>
          {summaries.map((s) => (
            <SelectItem key={s.position} value={s.position}>
              {positionShortLabels[s.position]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
            <CoordinationSummaryCard
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
