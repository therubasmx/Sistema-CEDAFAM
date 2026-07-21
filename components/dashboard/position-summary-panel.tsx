import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Position } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CoordinationSummaryCard } from "@/components/coordination/coordination-summary-card";
import { coordinationHref } from "@/lib/nav";
import { positionLabels } from "@/lib/labels";
import type { CoordinationSummary } from "@/lib/coordination-summary";

/**
 * Resumen del puesto de coordinación en el Dashboard de inicio del
 * psicólogo. Quien lleva Servicios de Atención Privada supervisa las otras
 * cinco coordinaciones, así que ve sus cinco tarjetas; el resto solo ve la
 * suya.
 */
export function PositionSummaryPanel({
  position,
  summaries,
}: {
  position: Position;
  summaries: CoordinationSummary[];
}) {
  const visible =
    position === Position.PRIVATE_CARE_SERVICES
      ? summaries
      : summaries.filter((s) => s.position === position);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{positionLabels[position]}</h2>
        <Button size="sm" variant="ghost" asChild>
          <Link href={coordinationHref(position)}>
            Abrir módulo
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className={visible.length > 1 ? "grid gap-4 lg:grid-cols-2" : undefined}>
        {visible.map((s) => (
          <CoordinationSummaryCard key={s.position} summary={s} expanded={false} />
        ))}
      </div>
    </div>
  );
}
