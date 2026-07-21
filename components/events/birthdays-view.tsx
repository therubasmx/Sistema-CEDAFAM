"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Cake, Pencil } from "lucide-react";
import { EventKind, EventScope } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { EventModuleView } from "@/components/events/event-module-view";
import { formatMxDateInput } from "@/lib/utils";

interface PersonBirthday {
  id: string;
  name: string;
  birthDate: string | null;
}

/** Mes y día (en hora de México) de una fecha de cumpleaños, para ordenar y mostrar sin depender de la zona horaria del navegador. */
function mxMonthDay(dateStr: string): [number, number] {
  const [, m, d] = formatMxDateInput(dateStr).split("-").map(Number);
  return [m, d];
}

/** "d 'de' MMMM" de una fecha de cumpleaños, en hora de México. */
function mxBirthdayLabel(dateStr: string): string {
  const [y, m, d] = formatMxDateInput(dateStr).split("-").map(Number);
  return format(new Date(y, m - 1, d), "d 'de' MMMM", { locale: es });
}

/**
 * Módulo de Cumpleaños: además del historial de festejos —que son eventos
 * normales— lleva el registro de la fecha de cumpleaños de cada persona, que se
 * repite cada año en el calendario de todos y no bloquea agenda.
 */
export function BirthdaysView() {
  return (
    <div className="space-y-8">
      <BirthdayRegistry />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Festejos</h2>
        <EventModuleView
          kind={EventKind.BIRTHDAY_PARTY}
          scope={EventScope.ALL}
          blurb="Los festejos se muestran en el calendario de todo el equipo."
        />
      </section>
    </div>
  );
}

function BirthdayRegistry() {
  const { toast } = useToast();
  const [people, setPeople] = useState<PersonBirthday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/birthdays");
    if (res.ok) setPeople(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withDate = useMemo(
    () =>
      people
        .filter((p) => p.birthDate)
        .sort((a, b) => {
          const [am, ad] = mxMonthDay(a.birthDate!);
          const [bm, bd] = mxMonthDay(b.birthDate!);
          return am - bm || ad - bd;
        }),
    [people],
  );
  const missing = people.filter((p) => !p.birthDate);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fechas de cumpleaños</h2>
          <p className="text-sm text-muted-foreground">
            Aparecen cada año en el calendario del equipo. No bloquean agenda.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setEditingUserId(null);
            setDialogOpen(true);
          }}
        >
          <Cake className="h-4 w-4" /> Añadir cumpleaños
        </Button>
      </div>

      {missing.length > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {missing.length} persona{missing.length === 1 ? "" : "s"} sin fecha
          registrada.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Cumpleaños</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : withDate.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Todavía no hay cumpleaños registrados.
                  </TableCell>
                </TableRow>
              ) : (
                withDate.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{mxBirthdayLabel(p.birthDate!)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar"
                        onClick={() => {
                          setEditingUserId(p.id);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BirthdayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        people={people}
        initialUserId={editingUserId}
        onSaved={load}
      />
    </section>
  );
}

function BirthdayDialog({
  open,
  onOpenChange,
  people,
  initialUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  people: PersonBirthday[];
  initialUserId: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(initialUserId);

  useEffect(() => {
    if (!open) return;
    setUserId(initialUserId ?? "");
    setError(null);
  }, [open, initialUserId]);

  // Al elegir a alguien que ya tiene fecha, se precarga para poder corregirla.
  useEffect(() => {
    const person = people.find((p) => p.id === userId);
    setDate(person?.birthDate ? formatMxDateInput(person.birthDate) : "");
  }, [userId, people]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/birthdays", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, birthDate: date }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar.");
      return;
    }
    toast({ title: "Cumpleaños registrado", variant: "success" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar cumpleaños" : "Añadir cumpleaños"}
          </DialogTitle>
          <DialogDescription>
            Se mostrará cada año en el calendario de todo el equipo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Persona *</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona a quién" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.birthDate ? " · ya registrado" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bd-date">Fecha de cumpleaños *</Label>
            <Input
              id="bd-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !userId || !date}>
              {submitting ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
