import type { WorkType } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { workTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Cupo máximo de pacientes activos por tipo de contrato.
 * Ajusta estos valores según la política de la clínica.
 */
export const WORKTYPE_CAPACITY: Record<WorkType, number> = {
  FULL_TIME: 12,
  PART_TIME: 6,
  INTERN: 4,
  FELLOW: 4,
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
      <CardHeader>
        <CardTitle>Capacidad de psicólogos</CardTitle>
        <CardDescription>
          Pacientes activos vs. cupo según tipo de contrato.
        </CardDescription>
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
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: Math.max(p.capacity, p.active) }).map(
                      (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-2 w-4 rounded-sm",
                            i >= p.capacity
                              ? "bg-red-500"
                              : i < p.active
                                ? "bg-primary"
                                : "bg-muted",
                          )}
                        />
                      ),
                    )}
                  </div>
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
