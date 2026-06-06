"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AssignDialog } from "@/components/assignments/assign-dialog";
import { serviceAreaLabels } from "@/lib/labels";
import type { ServiceArea } from "@prisma/client";

interface UnassignedPatient {
  id: string;
  fullName: string;
  age: number;
  serviceArea: ServiceArea;
  consultationReason: string;
  createdAt: string;
}

export function AssignmentsView() {
  const [rows, setRows] = useState<UnassignedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<UnassignedPatient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/patients?unassigned=true");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Edad</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Recibido</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay pacientes pendientes de asignación. 🎉
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/patients/${p.id}`}
                      className="hover:underline"
                    >
                      {p.fullName}
                    </Link>
                  </TableCell>
                  <TableCell>{p.age}</TableCell>
                  <TableCell>{serviceAreaLabels[p.serviceArea]}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {p.consultationReason}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(p.createdAt), "d MMM", { locale: es })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setTarget(p)}>
                      Asignar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {target && (
        <AssignDialog
          patientId={target.id}
          patientName={target.fullName}
          open={!!target}
          onOpenChange={(o) => !o && setTarget(null)}
          onAssigned={load}
        />
      )}
    </>
  );
}
