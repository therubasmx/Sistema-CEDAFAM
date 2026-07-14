"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ServiceArea } from "@prisma/client";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import {
  serviceAreaLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
} from "@/lib/labels";

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

export function PatientTable({ unassignedOnly = false }: { unassignedOnly?: boolean }) {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [q, setQ] = useState("");
  const [area, setArea] = useState<string>(ALL);
  const [sort, setSort] = useState<SortKey>("createdAt_desc");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (area !== ALL) params.set("serviceArea", area);
    if (unassignedOnly) params.set("unassigned", "true");
    params.set("sort", sort);
    const res = await fetch(`/api/patients?${params.toString()}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [q, area, sort, unassignedOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Buscar por nombre o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="sm:max-w-xs">
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

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
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
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
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
    </div>
  );
}
