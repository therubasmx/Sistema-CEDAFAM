"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarClock,
  CalendarPlus,
  History,
  MapPin,
  Pencil,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EventKind, EventScope } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import type { AgeRangeKey } from "@/lib/validators";
import { cn } from "@/lib/utils";

export interface ModuleEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  scope: EventScope;
  kind: EventKind;
  createdBy?: { name: string };
  attendees?: {
    psychologistId: string;
    psychologist: { user: { name: string } };
  }[];
  beneficiaryCount?: number | null;
  womenCount?: number | null;
  menCount?: number | null;
  ageRanges?: Partial<Record<AgeRangeKey, number>> | null;
}

interface Props {
  kind: EventKind;
  /** Con SELECTED el formulario pide invitados; con ALL aplica a todo el equipo. */
  scope: EventScope;
  /** Encabezado de la sección, cuando conviven varias en un mismo módulo. */
  title?: string;
  /** Texto bajo el título, explicando a quién afecta el evento. */
  blurb: string;
  /** Texto del botón de creación. */
  createLabel?: string;
  /** Atención Privada lo ve, pero sin crear ni borrar eventos. */
  readOnly?: boolean;
}

/**
 * Pantalla compartida por Extensión a la Comunidad, Capital Humano y
 * Cumpleaños: historial de eventos del módulo más el botón para crear uno.
 * Lo único que cambia entre los tres es el alcance y si se eligen invitados.
 */
export function EventModuleView({
  kind,
  scope,
  title,
  blurb,
  createLabel = "Nuevo evento",
  readOnly = false,
}: Props) {
  const { toast } = useToast();
  const [events, setEvents] = useState<ModuleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleEvent | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar/events?kind=${kind}`);
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...events].sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
    );
    return {
      upcoming: sorted
        .filter((e) => new Date(e.endAt).getTime() >= now)
        .reverse(),
      past: sorted.filter((e) => new Date(e.endAt).getTime() < now),
    };
  }, [events]);

  async function remove(id: string) {
    setDeleting(id);
    const res = await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo eliminar",
        description: d.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Evento eliminado", variant: "success" });
    load();
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(ev: ModuleEvent) {
    setEditing(ev);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>
        {!readOnly && (
          <Button onClick={openCreate}>
            <CalendarPlus className="h-4 w-4" /> {createLabel}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : events.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Todavía no hay eventos</p>
          {!readOnly && (
            <p className="text-sm text-muted-foreground">
              Crea el primero con el botón de arriba.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Section
            title="Próximos"
            icon={CalendarClock}
            events={upcoming}
            onDelete={remove}
            onEdit={openEdit}
            deleting={deleting}
            emptyLabel="Sin eventos próximos."
            readOnly={readOnly}
          />
          <Section
            title="Realizados"
            icon={History}
            events={past}
            onDelete={remove}
            onEdit={openEdit}
            deleting={deleting}
            emptyLabel="Sin eventos pasados."
            muted
            readOnly={readOnly}
          />
        </div>
      )}

      {!readOnly && (
        <EventFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={load}
          kind={kind}
          scope={scope}
          editing={editing}
        />
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  events,
  onDelete,
  onEdit,
  deleting,
  emptyLabel,
  muted,
  readOnly,
}: {
  title: string;
  icon: LucideIcon;
  events: ModuleEvent[];
  onDelete: (id: string) => void;
  onEdit: (ev: ModuleEvent) => void;
  deleting: string | null;
  emptyLabel: string;
  muted?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title} ({events.length})
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className={cn(muted && "opacity-70")}>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">{e.title}</CardTitle>
                  <CardDescription>
                    {format(new Date(e.startAt), "EEEE d 'de' MMMM yyyy, HH:mm", {
                      locale: es,
                    })}
                    {" – "}
                    {format(new Date(e.endAt), "HH:mm")}
                  </CardDescription>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Editar evento"
                      aria-label={`Editar evento ${e.title}`}
                      onClick={() => onEdit(e)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Eliminar evento"
                      aria-label={`Eliminar evento ${e.title}`}
                      disabled={deleting === e.id}
                      onClick={() => onDelete(e.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {e.description && <p>{e.description}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                  {e.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {e.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {e.scope === EventScope.ALL
                      ? "Todo el equipo"
                      : `${e.attendees?.length ?? 0} invitado${(e.attendees?.length ?? 0) === 1 ? "" : "s"}`}
                  </span>
                </div>
                {e.scope === EventScope.SELECTED &&
                  (e.attendees?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {e.attendees!.map((a) => (
                        <Badge key={a.psychologistId} variant="secondary">
                          {a.psychologist.user.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                {(e.beneficiaryCount != null ||
                  e.womenCount != null ||
                  e.menCount != null) && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {e.beneficiaryCount != null &&
                      `${e.beneficiaryCount} persona${e.beneficiaryCount === 1 ? "" : "s"} beneficiada${e.beneficiaryCount === 1 ? "" : "s"}`}
                    {(e.womenCount != null || e.menCount != null) &&
                      ` (${[
                        e.womenCount != null && `${e.womenCount} mujeres`,
                        e.menCount != null && `${e.menCount} hombres`,
                      ]
                        .filter(Boolean)
                        .join(" · ")})`}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
