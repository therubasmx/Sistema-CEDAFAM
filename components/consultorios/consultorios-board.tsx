"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  X,
  GripVertical,
  RefreshCw,
} from "lucide-react";
import { AppointmentServiceType, AppointmentStatus, Room } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { roomLabels, ROOM_ORDER, ROOM_DAILY_CAPACITY } from "@/lib/labels";
import { formatMxTime, formatMxWeekdayDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface BoardAppointment {
  id: string;
  scheduledAt: string;
  duration: number;
  serviceType: AppointmentServiceType;
  status: AppointmentStatus;
  room: Room | null;
  patient: { id: string; fullName: string };
  psychologist: { id: string; user: { name: string } };
}

/** Drop-zone que representa el grupo de pacientes sin consultorio asignado. */
const POOL = "__pool__";

function startMs(a: BoardAppointment) {
  return new Date(a.scheduledAt).getTime();
}
function endMs(a: BoardAppointment) {
  return startMs(a) + a.duration * 60_000;
}
function overlaps(a: BoardAppointment, b: BoardAppointment) {
  return startMs(a) < endMs(b) && startMs(b) < endMs(a);
}

/** Suma/resta días sin cruzar husos (la CDMX no tiene horario de verano). */
function shiftDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function ConsultoriosBoard() {
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(() => new Date());
  const [appts, setAppts] = useState<BoardAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const load = useCallback(async (ref: Date) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/appointments/board?date=${encodeURIComponent(ref.toISOString())}`,
      );
      if (res.ok) setAppts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const unassigned = useMemo(
    () =>
      appts
        .filter((a) => a.room === null)
        .sort((a, b) => startMs(a) - startMs(b)),
    [appts],
  );

  const byRoom = useMemo(() => {
    const map = new Map<Room, BoardAppointment[]>();
    for (const room of ROOM_ORDER) map.set(room, []);
    for (const a of appts) {
      if (a.room) map.get(a.room)?.push(a);
    }
    for (const list of map.values()) list.sort((a, b) => startMs(a) - startMs(b));
    return map;
  }, [appts]);

  /** ¿Se puede soltar `appt` en `room`? Devuelve el motivo si no. */
  function validateDrop(
    appt: BoardAppointment,
    room: Room,
  ): { ok: true } | { ok: false; reason: string } {
    if (appt.room === room) return { ok: true };
    const inRoom = byRoom.get(room) ?? [];
    const clash = inRoom.find((a) => a.id !== appt.id && overlaps(a, appt));
    if (clash) {
      return {
        ok: false,
        reason: `${roomLabels[room]} ya tiene a ${clash.patient.fullName} a esa hora (${formatMxTime(clash.scheduledAt)}).`,
      };
    }
    const others = inRoom.filter((a) => a.id !== appt.id).length;
    if (others >= ROOM_DAILY_CAPACITY) {
      return {
        ok: false,
        reason: `${roomLabels[room]} ya tiene ${ROOM_DAILY_CAPACITY} pacientes ese día.`,
      };
    }
    return { ok: true };
  }

  async function assign(id: string, room: Room | null) {
    const appt = appts.find((a) => a.id === id);
    if (!appt || appt.room === room) return;

    if (room) {
      const check = validateDrop(appt, room);
      if (!check.ok) {
        toast({ title: "No se puede asignar", description: check.reason, variant: "destructive" });
        return;
      }
    }

    const previous = appt.room;
    // Optimista: mover la tarjeta de inmediato.
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, room } : a)));

    const res = await fetch(`/api/appointments/${id}/room`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      // Revertir al estado anterior.
      setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, room: previous } : a)));
      toast({
        title: "No se pudo guardar",
        description: d.error ?? "Intenta de nuevo.",
        variant: "destructive",
      });
    }
  }

  function onDropTo(key: string) {
    const id = dragId;
    setDragId(null);
    setOverKey(null);
    if (!id) return;
    assign(id, key === POOL ? null : (key as Room));
  }

  const dateLabel = formatMxWeekdayDate(date);
  const isToday =
    formatMxWeekdayDate(new Date()) === dateLabel;

  return (
    <div className="space-y-4">
      {/* Barra de fecha */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Día anterior"
            onClick={() => setDate((d) => shiftDays(d, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Día siguiente"
            onClick={() => setDate((d) => shiftDays(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-medium capitalize">{dateLabel}</p>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>
            Hoy
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Actualizar"
          className="ml-auto"
          onClick={() => load(date)}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando tablero…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
          {/* Pacientes sin consultorio */}
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setOverKey(POOL);
            }}
            onDragLeave={() => setOverKey((k) => (k === POOL ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              onDropTo(POOL);
            }}
            className={cn(
              "flex h-fit flex-col gap-2 rounded-lg border bg-card p-3 transition-colors lg:sticky lg:top-4",
              overKey === POOL && "border-primary bg-primary/5",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Pacientes por asignar</h2>
              <Badge variant="secondary">{unassigned.length}</Badge>
            </div>
            {unassigned.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Todas las citas del día tienen consultorio.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {unassigned.map((a) => (
                  <PatientCard
                    key={a.id}
                    appt={a}
                    dragging={dragId === a.id}
                    onDragStart={() => setDragId(a.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverKey(null);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Consultorios */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ROOM_ORDER.map((room) => {
              const list = byRoom.get(room) ?? [];
              const full = list.length >= ROOM_DAILY_CAPACITY;
              return (
                <section
                  key={room}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverKey(room);
                  }}
                  onDragLeave={() => setOverKey((k) => (k === room ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropTo(room);
                  }}
                  className={cn(
                    "flex min-h-[8rem] flex-col gap-2 rounded-lg border bg-card p-3 transition-colors",
                    overKey === room && "border-primary bg-primary/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {roomLabels[room]}
                    </h3>
                    <Badge variant={full ? "warning" : "secondary"}>
                      {list.length}/{ROOM_DAILY_CAPACITY}
                    </Badge>
                  </div>
                  {list.length === 0 ? (
                    <p className="flex-1 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                      Arrastra pacientes aquí
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {list.map((a) => (
                        <PatientCard
                          key={a.id}
                          appt={a}
                          dragging={dragId === a.id}
                          onDragStart={() => setDragId(a.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverKey(null);
                          }}
                          onUnassign={() => assign(a.id, null)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PatientCard({
  appt,
  dragging,
  onDragStart,
  onDragEnd,
  onUnassign,
}: {
  appt: BoardAppointment;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUnassign?: () => void;
}) {
  const start = formatMxTime(appt.scheduledAt);
  const end = formatMxTime(new Date(new Date(appt.scheduledAt).getTime() + appt.duration * 60_000));

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", appt.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex cursor-grab items-start gap-2 rounded-md border bg-background p-2.5 text-sm shadow-sm active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-semibold">{appt.patient.fullName}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{appt.psychologist.user.name}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          {start}–{end}
        </p>
      </div>
      {onUnassign && (
        <button
          type="button"
          aria-label="Quitar del consultorio"
          onClick={onUnassign}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
