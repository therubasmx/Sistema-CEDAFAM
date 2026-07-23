import { Gauge } from "lucide-react";
import type { WorkType } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CapacityMeter } from "@/components/dashboard/capacity-meter";
import { workTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Cupo máximo de pacientes activos por tipo de contrato.
 * Ajusta estos valores según la política de la clínica.
 */
export const WORKTYPE_CAPACITY: Record<WorkType, number> = {
  FULL_TIME: 15,
  PART_TIME: 8,
  INTERN: 10,
  FELLOW: 15,
};

export interface CapacityEntry {
  id: string;
  name: string;
  workType: WorkType;
  active: number;
  capacity: number;
}

interface CapacityPanelProps {
  data: CapacityEntry[];
}

export function CapacityPanel({ data }: CapacityPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gauge className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Capacidad de psicólogos</CardTitle>
          <CardDescription>
            Pacientes activos vs. cupo según tipo de contrato.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay psicólogos activos.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((p) => {
              const overflow = p.active > p.capacity;
              return (
                <li key={p.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {overflow && <Badge variant="destructive">Sobrecupo</Badge>}
                      <span
                        className={cn(
                          "text-xs",
                          overflow
                            ? "font-semibold text-red-600"
                            : "text-muted-foreground",
                        )}
                      >
                        {p.active}/{p.capacity}
                      </span>
                    </span>
                  </div>
                  <CapacityMeter value={p.active} capacity={p.capacity} overflow={overflow} />
                  <p className="text-[11px] text-muted-foreground">
                    {workTypeLabels[p.workType]}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
