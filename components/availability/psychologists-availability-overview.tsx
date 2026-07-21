"use client";

import { useEffect, useState } from "react";
import { Speciality, WorkType } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { specialityLabels, workTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
];

const MORNING_SLOTS = [
  { startTime: "09:00", label: "9:00 am" },
  { startTime: "10:00", label: "10:00 am" },
  { startTime: "11:00", label: "11:00 am" },
];
const NOON_SLOT = { startTime: "12:00", label: "12:00 pm" };
const AFTERNOON_SLOTS = [
  { startTime: "14:30", label: "2:30 pm" },
  { startTime: "15:30", label: "3:30 pm" },
  { startTime: "16:30", label: "4:30 pm" },
  { startTime: "17:30", label: "5:30 pm" },
];

const ALL_SLOTS = [...MORNING_SLOTS, NOON_SLOT, ...AFTERNOON_SLOTS];

function daySlots(dayOfWeek: number) {
  const morning = [...MORNING_SLOTS, NOON_SLOT];
  const afternoon = dayOfWeek === 5 ? [] : AFTERNOON_SLOTS;
  return [...morning, ...afternoon];
}

interface AvailabilityBlock {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface PsychologistData {
  id: string;
  name: string;
  speciality: Speciality;
  workType: WorkType;
  activePatientCount: number;
  availability: AvailabilityBlock[];
}

export function PsychologistsAvailabilityOverview() {
  const [psychologists, setPsychologists] = useState<PsychologistData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/availability/overview")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PsychologistData[]) => {
        setPsychologists(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (psychologists.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay psicólogos activos registrados.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {psychologists.map((psy) => {
        const availSet = new Set(
          psy.availability.map((a) => `${a.dayOfWeek}|${a.startTime}`),
        );
        const totalSlots = psy.availability.length;

        return (
          <Card key={psy.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-base">{psy.name}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {specialityLabels[psy.speciality]}
                  </Badge>
                  <Badge variant="outline">
                    {workTypeLabels[psy.workType]}
                  </Badge>
                  <Badge variant="outline">
                    {psy.activePatientCount} pacientes
                  </Badge>
                  {totalSlots > 0 ? (
                    <Badge variant="success">
                      {totalSlots} {totalSlots === 1 ? "bloque" : "bloques"} disponible{totalSlots !== 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Sin disponibilidad</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {totalSlots === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No ha registrado disponibilidad en su último reporte semanal.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-1.5 pr-3 text-left font-medium text-muted-foreground w-20">
                          Hora
                        </th>
                        {DAYS.map((d) => (
                          <th
                            key={d.value}
                            className="py-1.5 px-2 text-center font-medium"
                          >
                            {d.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_SLOTS.map((s) => (
                        <tr key={s.startTime} className="border-b last:border-0">
                          <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                            {s.label}
                          </td>
                          {DAYS.map((d) => {
                            const isAvailableDay = daySlots(d.value).some(
                              (ds) => ds.startTime === s.startTime,
                            );
                            const active = availSet.has(
                              `${d.value}|${s.startTime}`,
                            );
                            return (
                              <td
                                key={d.value}
                                className="py-1.5 px-2 text-center"
                              >
                                {isAvailableDay ? (
                                  <span
                                    className={cn(
                                      "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs",
                                      active
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border/30 text-muted-foreground/30",
                                    )}
                                  >
                                    {active ? "✓" : ""}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/20">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
