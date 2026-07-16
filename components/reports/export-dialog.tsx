"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ALL_SECTIONS,
  PATIENT_SECTIONS,
  PSYCH_SECTIONS,
  SECTION_LABELS,
  type ReportSection,
} from "@/lib/report-sections";

type ExportFormat = "xlsx" | "pdf";

export function ExportDialog({ start, end }: { start: string; end: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [selected, setSelected] = useState<Set<ReportSection>>(
    () => new Set(ALL_SECTIONS),
  );

  const toggle = (key: ReportSection) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (keys: readonly ReportSection[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const download = () => {
    const sections = [...selected].join(",");
    window.location.href = `/api/reports/export?start=${start}&end=${end}&format=${format}&sections=${sections}`;
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4" /> Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar reporte</DialogTitle>
          <DialogDescription>
            Del {start} al {end}. Elige formato y qué incluir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format */}
          <div className="space-y-2">
            <Label>Formato</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === "xlsx" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setFormat("xlsx")}
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button
                type="button"
                variant={format === "pdf" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setFormat("pdf")}
              >
                <FileText className="h-4 w-4" /> PDF
              </Button>
            </div>
          </div>

          {/* Sections */}
          <SectionGroup
            title="Pacientes"
            keys={PATIENT_SECTIONS}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleGroup(PATIENT_SECTIONS)}
          />
          <SectionGroup
            title="Psicólogos"
            keys={PSYCH_SECTIONS}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => toggleGroup(PSYCH_SECTIONS)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={download} disabled={selected.size === 0}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionGroup({
  title,
  keys,
  selected,
  onToggle,
  onToggleAll,
}: {
  title: string;
  keys: readonly ReportSection[];
  selected: Set<ReportSection>;
  onToggle: (key: ReportSection) => void;
  onToggleAll: () => void;
}) {
  const allOn = keys.every((k) => selected.has(k));
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={onToggleAll}
        >
          {allOn ? "Quitar todo" : "Seleccionar todo"}
        </button>
      </div>
      <div className="space-y-1.5">
        {keys.map((key) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={selected.has(key)}
              onChange={() => onToggle(key)}
            />
            {SECTION_LABELS[key]}
          </label>
        ))}
      </div>
    </div>
  );
}
