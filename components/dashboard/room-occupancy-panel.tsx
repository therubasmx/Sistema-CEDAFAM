import Link from "next/link";
import type { Room } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <CardHeader>
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
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: Math.max(r.capacity, r.occupied) }).map(
                    (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-2 w-4 rounded-sm",
                          i >= r.capacity
                            ? "bg-red-500"
                            : i < r.occupied
                              ? "bg-primary"
                              : "bg-muted",
                        )}
                      />
                    ),
                  )}
                </div>
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
