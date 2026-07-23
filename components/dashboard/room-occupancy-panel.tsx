import Link from "next/link";
import { DoorOpen } from "lucide-react";
import type { Room } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CapacityMeter } from "@/components/dashboard/capacity-meter";
import { ROOM_DAILY_CAPACITY } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface RoomOccupancyEntry {
  room: Room;
  label: string;
  occupied: number;
  capacity: number;
}

interface RoomOccupancyPanelProps {
  data: RoomOccupancyEntry[];
  /** Citas agendadas hoy que aún no tienen consultorio asignado. */
  unassigned: number;
}

export function RoomOccupancyPanel({ data, unassigned }: RoomOccupancyPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <DoorOpen className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Ocupación de consultorios</CardTitle>
          <CardDescription>
            Pacientes agendados hoy por consultorio (máx. {ROOM_DAILY_CAPACITY}).{" "}
            <Link
              href="/dashboard/consultorios"
              className="font-medium text-primary hover:underline"
            >
              Ver tablero
            </Link>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {data.map((r) => {
            const overflow = r.occupied > r.capacity;
            const full = r.occupied >= r.capacity;
            return (
              <li key={r.room} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{r.label}</span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    {overflow ? (
                      <Badge variant="destructive">Sobrecupo</Badge>
                    ) : full ? (
                      <Badge variant="warning">Lleno</Badge>
                    ) : null}
                    <span
                      className={cn(
                        "text-xs",
                        overflow
                          ? "font-semibold text-red-600"
                          : "text-muted-foreground",
                      )}
                    >
                      {r.occupied}/{r.capacity}
                    </span>
                  </span>
                </div>
                <CapacityMeter value={r.occupied} capacity={r.capacity} overflow={overflow} />
              </li>
            );
          })}
        </ul>
        {unassigned > 0 && (
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{unassigned}</span>{" "}
            {unassigned === 1 ? "paciente agendado" : "pacientes agendados"} hoy sin
            consultorio asignado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
