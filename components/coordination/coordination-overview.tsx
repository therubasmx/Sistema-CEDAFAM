"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CoordinationSummary } from "@/lib/coordination-summary";
import { CoordinationSummaryCard } from "@/components/coordination/coordination-summary-card";

/**
 * Panel de Coordinación Servicios de Atención Privada: una tarjeta resumen
 * por coordinación. El Jefe Principal la ve igual, porque supervisa las
 * seis. Para el historial completo de una coordinación se entra a su módulo
 * (la flecha de la tarjeta, o el enlace directo en la barra lateral —
 * `coordinationFilterChildren` en `lib/nav.ts`).
 */
export function CoordinationOverview() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <CalendarRange className="mb-2 h-5 w-5 shrink-0 text-muted-foreground" />
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {summaries.map((s) => (
            <CoordinationSummaryCard key={s.position} summary={s} expanded={false} />
          ))}
        </div>
      )}
    </div>
  );
}
