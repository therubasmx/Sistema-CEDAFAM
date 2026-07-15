"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListFilter } from "lucide-react";
import { Role, ServiceArea } from "@prisma/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  serviceAreaLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
} from "@/lib/labels";

interface PsychologistOption {
  id: string;
  name: string;
}

interface PatientRow {
  id: string;
  fullName: string;
  age: number;
  phoneNumber: string;
  serviceArea: ServiceArea;
  isHistorical: boolean;
  createdAt: string;
  assignments: {
    isActive: boolean;
    psychologist: { user: { name: string } };
  }[];
  statuses: {
    therapyStatus: keyof typeof therapyStatusLabels | null;
    evaluationStatus: keyof typeof evaluationStatusLabels | null;
  }[];
}

const ALL = "ALL";

const SORT_OPTIONS = {
  createdAt_asc: "Más antiguo primero",
  createdAt_desc: "Más reciente primero",
  fullName_asc: "Nombre (A-Z)",
  fullName_desc: "Nombre (Z-A)",
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

const DATE_PRESETS = {
  ALL: "Cualquier fecha",
  "7d": "Últimos 7 días",
  "30d": "Último mes",
  custom: "Personalizado",
} as const;

type DatePreset = keyof typeof DATE_PRESETS;

// yyyy-mm-dd in local time, for <input type="date"> and for computed presets.
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PAGE_SIZE = 15;

export function PatientTable({
  unassignedOnly = false,
  role,
}: {
  unassignedOnly?: boolean;
  role?: Role;
}) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("createdAt_desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [psychologists, setPsychologists] = useState<PsychologistOption[]>([]);

  // Filtros aplicados: son los que realmente disparan la consulta.
  const [area, setArea] = useState<string>(ALL);
  const [psychologistId, setPsychologistId] = useState<string>(ALL);
  const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Filtros en borrador: lo que el usuario edita dentro del panel "Filtros"
  // hasta que presiona "Aplicar filtros".
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftArea, setDraftArea] = useState<string>(ALL);
  const [draftPsychologistId, setDraftPsychologistId] = useState<string>(ALL);
  const [draftDatePreset, setDraftDatePreset] = useState<DatePreset>("ALL");
  const [draftCustomFrom, setDraftCustomFrom] = useState("");
  const [draftCustomTo, setDraftCustomTo] = useState("");

  // Los psicólogos solo ven sus propios pacientes (forzado por la API), así
  // que el filtro por psicólogo no aplica para ese rol.
  const showPsychologistFilter = role !== Role.PSYCHOLOGIST;

  useEffect(() => {
    if (!showPsychologistFilter) return;
    fetch("/api/psychologists")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; name: string }[]) => setPsychologists(data));
  }, [showPsychologistFilter]);

  function handleFiltersOpenChange(open: boolean) {
    if (open) {
      setDraftArea(area);
      setDraftPsychologistId(psychologistId);
      setDraftDatePreset(datePreset);
      setDraftCustomFrom(customFrom);
      setDraftCustomTo(customTo);
    }
    setFiltersOpen(open);
  }

  function applyFilters() {
    setArea(draftArea);
    setPsychologistId(draftPsychologistId);
    setDatePreset(draftDatePreset);
    setCustomFrom(draftCustomFrom);
    setCustomTo(draftCustomTo);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setArea(ALL);
    setPsychologistId(ALL);
    setDatePreset("ALL");
    setCustomFrom("");
    setCustomTo("");
    setDraftArea(ALL);
    setDraftPsychologistId(ALL);
    setDraftDatePreset("ALL");
    setDraftCustomFrom("");
    setDraftCustomTo("");
    setFiltersOpen(false);
  }

  const activeFilterCount =
    (area !== ALL ? 1 : 0) +
    (psychologistId !== ALL ? 1 : 0) +
    (datePreset !== "ALL" ? 1 : 0);

  // Cualquier cambio de filtro/orden regresa a la página 1.
  useEffect(() => {
    setPage(1);
  }, [q, area, psychologistId, datePreset, customFrom, customTo, sort, unassignedOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (area !== ALL) params.set("serviceArea", area);
    if (psychologistId !== ALL) params.set("psychologistId", psychologistId);
    if (unassignedOnly) params.set("unassigned", "true");

    if (datePreset === "7d" || datePreset === "30d") {
      const from = new Date();
      from.setDate(from.getDate() - (datePreset === "7d" ? 7 : 30));
      params.set("dateFrom", from.toISOString());
    } else if (datePreset === "custom") {
      if (customFrom) params.set("dateFrom", new Date(`${customFrom}T00:00:00`).toISOString());
      if (customTo) params.set("dateTo", new Date(`${customTo}T23:59:59.999`).toISOString());
    }

    params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const res = await fetch(`/api/patients?${params.toString()}`);
    if (res.ok) {
      setRows(await res.json());
      setTotal(Number(res.headers.get("X-Total-Count") ?? 0));
    }
    setLoading(false);
  }, [q, area, psychologistId, datePreset, customFrom, customTo, sort, unassignedOnly, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Buscar por nombre o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        <Popover open={filtersOpen} onOpenChange={handleFiltersOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <ListFilter className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge className="px-1.5 py-0 text-xs">{activeFilterCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Área</Label>
                <Select value={draftArea} onValueChange={setDraftArea}>
                  <SelectTrigger>
                    <SelectValue placeholder="Área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas las áreas</SelectItem>
                    {Object.values(ServiceArea).map((a) => (
                      <SelectItem key={a} value={a}>
                        {serviceAreaLabels[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showPsychologistFilter && (
                <div className="space-y-1.5">
                  <Label>Psicólogo</Label>
                  <Select value={draftPsychologistId} onValueChange={setDraftPsychologistId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Psicólogo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos los psicólogos</SelectItem>
                      {psychologists.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Select
                  value={draftDatePreset}
                  onValueChange={(v) => setDraftDatePreset(v as DatePreset)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DATE_PRESETS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {draftDatePreset === "custom" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="date"
                      value={draftCustomFrom}
                      max={draftCustomTo || undefined}
                      onChange={(e) => setDraftCustomFrom(e.target.value)}
                    />
                    <span className="text-muted-foreground text-sm">a</span>
                    <Input
                      type="date"
                      value={draftCustomTo}
                      min={draftCustomFrom || undefined}
                      max={toDateInputValue(new Date())}
                      onChange={(e) => setDraftCustomTo(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Borrar filtros
                </Button>
                <Button size="sm" onClick={applyFilters}>
                  Aplicar filtros
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="sm:max-w-xs">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_OPTIONS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="max-h-[70vh] overflow-y-auto rounded-md border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Edad</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Psicólogo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No hay pacientes.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p, index) => {
                const assignment = p.assignments.find((a) => a.isActive);
                const status = p.statuses[0];
                const statusLabel = status
                  ? status.therapyStatus
                    ? therapyStatusLabels[status.therapyStatus]
                    : status.evaluationStatus
                      ? evaluationStatusLabels[status.evaluationStatus]
                      : null
                  : null;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + index + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/patients/${p.id}`}
                        className="hover:underline"
                      >
                        {p.fullName}
                      </Link>
                      {p.isHistorical && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Historial
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.age}</TableCell>
                    <TableCell>{serviceAreaLabels[p.serviceArea]}</TableCell>
                    <TableCell>
                      {p.isHistorical ? (
                        <span className="text-muted-foreground text-sm">Previo al sistema</span>
                      ) : assignment ? (
                        assignment.psychologist.user.name
                      ) : (
                        <Badge variant="warning">Sin asignar</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {statusLabel ? (
                        <Badge variant="secondary">{statusLabel}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.createdAt
                        ? new Date(p.createdAt).toLocaleDateString("es-MX")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "0 pacientes" : `Página ${page} de ${totalPages} · ${total} pacientes`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
