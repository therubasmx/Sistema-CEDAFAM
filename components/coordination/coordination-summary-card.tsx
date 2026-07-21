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
import { coordinationHref } from "@/lib/nav";
import { positionDescriptions, positionLabels } from "@/lib/labels";
import type { ActivityTone, CoordinationSummary } from "@/lib/coordination-summary";

const toneVariant: Record<ActivityTone, BadgeProps["variant"]> = {
  default: "secondary",
  success: "success",
  warning: "warning",
  destructive: "destructive",
};

/**
 * Tarjeta de cifras + actividad reciente de una coordinación. La usa
 * CoordinationOverview (las seis, con filtros) y el resumen de puesto del
 * Dashboard de inicio (solo la propia).
 */
export function CoordinationSummaryCard({
  summary,
  expanded,
}: {
  summary: CoordinationSummary;
  expanded: boolean;
}) {
  const position = summary.position as Position;
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
