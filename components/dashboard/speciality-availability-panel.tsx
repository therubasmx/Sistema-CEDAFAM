import Link from "next/link";
import type { Speciality } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { specialityLabels } from "@/lib/labels";

export interface SpecialityAvailabilityEntry {
  speciality: Speciality;
  count: number;
  freeSlots: number;
}

interface SpecialityAvailabilityPanelProps {
  data: SpecialityAvailabilityEntry[];
}

export function SpecialityAvailabilityPanel({
  data,
}: SpecialityAvailabilityPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Disponibilidad por especialidad</CardTitle>
        <CardDescription>
          Cupo libre agregado por especialidad.{" "}
          <Link
            href="/dashboard/availability"
            className="font-medium text-primary hover:underline"
          >
            Ver horarios
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay psicólogos activos.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((s) => (
              <li
                key={s.speciality}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="block truncate font-medium">
                    {specialityLabels[s.speciality]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {s.count} {s.count === 1 ? "psicólogo" : "psicólogos"}
                  </span>
                </div>
                <Badge variant={s.freeSlots > 0 ? "success" : "warning"}>
                  {s.freeSlots} {s.freeSlots === 1 ? "cupo" : "cupos"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
