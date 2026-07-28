"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { formatMxDate } from "@/lib/utils";

interface FolioItem {
  id: string;
  folio: number;
  isHistorical: boolean;
  patientName: string;
  fileNumber: string | null;
  evaluatorName: string;
  diagnosis: string | null;
  firstInterviewAt: string | null;
  resultsDeliveryAt: string | null;
  evaluationDateText: string | null;
  reportLink: string | null;
  patient: { id: string } | null;
}

/** Igual que en la ficha del paciente: rango capturado, o el texto literal del papel. */
function evaluationDate(f: FolioItem): string {
  if (f.firstInterviewAt && f.resultsDeliveryAt) {
    return `${formatMxDate(f.firstInterviewAt)} – ${formatMxDate(f.resultsDeliveryAt)}`;
  }
  return f.evaluationDateText ?? "—";
}

export function AllFoliosList() {
  const [folios, setFolios] = useState<FolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FolioItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/evaluations");
    if (res.ok) setFolios(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folios;
    return folios.filter((f) =>
      [f.folio, f.patientName, f.fileNumber, f.evaluatorName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [folios, query]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Todos los folios de evaluación emitidos, incluidos los ya ligados a un
          expediente.
        </p>
        {folios.length > 0 && (
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar folio, paciente o evaluador…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando folios…</p>
      ) : folios.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No hay folios registrados.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {shown.length} de {folios.length} folios
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Folio</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Expediente</TableHead>
                  <TableHead>Evaluador</TableHead>
                  <TableHead>Fecha de evaluación</TableHead>
                  <TableHead>Vínculo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-semibold">
                      <span className="flex items-center gap-2">
                        {f.folio}
                        {f.isHistorical && (
                          <Badge variant="outline" className="font-normal">
                            Anterior
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setSelected(f)}
                        className="text-left font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {f.patientName}
                      </button>
                    </TableCell>
                    <TableCell>{f.fileNumber ?? "—"}</TableCell>
                    <TableCell>{f.evaluatorName}</TableCell>
                    <TableCell>{evaluationDate(f)}</TableCell>
                    <TableCell>
                      {f.patient ? (
                        <Badge variant="success">Vinculado</Badge>
                      ) : (
                        <Badge variant="outline">Sin expediente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Folio de evaluación {selected.folio}
                  {selected.isHistorical && (
                    <Badge variant="outline" className="font-normal">
                      Registro anterior
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {selected.isHistorical
                    ? "Viene del registro en papel."
                    : selected.patientName}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Folio</dt>
                <dd className="col-span-2 font-semibold">{selected.folio}</dd>

                <dt className="font-medium text-muted-foreground">Paciente</dt>
                <dd className="col-span-2">{selected.patientName}</dd>

                <dt className="font-medium text-muted-foreground">Expediente</dt>
                <dd className="col-span-2">{selected.fileNumber ?? "—"}</dd>

                <dt className="font-medium text-muted-foreground">Evaluador</dt>
                <dd className="col-span-2">{selected.evaluatorName}</dd>

                <dt className="font-medium text-muted-foreground">
                  Fecha de evaluación
                </dt>
                <dd className="col-span-2">{evaluationDate(selected)}</dd>

                <dt className="font-medium text-muted-foreground">Diagnóstico</dt>
                <dd className="col-span-2 whitespace-pre-wrap">
                  {selected.diagnosis ?? (
                    <span className="text-muted-foreground">Sin capturar</span>
                  )}
                </dd>

                <dt className="font-medium text-muted-foreground">Link</dt>
                <dd className="col-span-2">
                  {selected.reportLink ? (
                    <a
                      href={selected.reportLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 break-all text-primary underline underline-offset-4"
                    >
                      {selected.reportLink}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </dl>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                  Cerrar
                </Button>
                {selected.patient && (
                  <Button type="button" asChild>
                    <Link href={`/dashboard/patients/${selected.patient.id}`}>
                      Ver paciente
                    </Link>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
