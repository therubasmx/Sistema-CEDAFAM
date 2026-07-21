"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ServiceType, TherapyStatus, EvaluationStatus } from "@prisma/client";
import { Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  serviceTypeLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
} from "@/lib/labels";
import { formatMxDateTime, cn } from "@/lib/utils";

interface StatusHistoryItem {
  id: string;
  serviceType: ServiceType;
  therapyStatus: TherapyStatus | null;
  evaluationStatus: EvaluationStatus | null;
  notes: string | null;
  changedAt: string | Date;
  changedBy: { name: string };
}

export function StatusHistoryList({
  patientId,
  initialItems,
  canManage,
}: {
  patientId: string;
  initialItems: StatusHistoryItem[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StatusHistoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.THERAPY);
  const [therapyStatus, setTherapyStatus] = useState<TherapyStatus | "">("");
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | "">("");
  const [notes, setNotes] = useState("");

  function startEdit(item: StatusHistoryItem) {
    setEditingId(item.id);
    setServiceType(item.serviceType);
    setTherapyStatus(item.serviceType === ServiceType.EVALUATION ? "" : (item.therapyStatus ?? ""));
    setEvaluationStatus(
      item.serviceType === ServiceType.EVALUATION ? (item.evaluationStatus ?? "") : "",
    );
    setNotes(item.notes ?? "");
  }

  function handleServiceTypeChange(val: ServiceType) {
    setServiceType(val);
    setTherapyStatus("");
    setEvaluationStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const body: Record<string, unknown> = { serviceType };
    if (serviceType === ServiceType.EVALUATION) {
      if (!evaluationStatus) {
        toast({ title: "Selecciona un estado de evaluación", variant: "destructive" });
        return;
      }
      body.evaluationStatus = evaluationStatus;
    } else {
      if (!therapyStatus) {
        toast({ title: "Selecciona un estado", variant: "destructive" });
        return;
      }
      body.therapyStatus = therapyStatus;
    }
    body.notes = notes.trim() || null;

    setSaving(true);
    const res = await fetch(`/api/patients/${patientId}/status/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Error al guardar", description: data.error, variant: "destructive" });
      return;
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              serviceType,
              therapyStatus:
                serviceType === ServiceType.EVALUATION ? null : (therapyStatus as TherapyStatus),
              evaluationStatus:
                serviceType === ServiceType.EVALUATION
                  ? (evaluationStatus as EvaluationStatus)
                  : null,
              notes: notes.trim() || null,
            }
          : it,
      ),
    );
    setEditingId(null);
    toast({ title: "Registro actualizado", variant: "success" });
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/patients/${patientId}/status/${deleteTarget.id}`, {
      method: "DELETE",
    });
    setDeleting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Error al eliminar", description: data.error, variant: "destructive" });
      return;
    }

    setItems((prev) => prev.filter((it) => it.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast({ title: "Registro eliminado", variant: "success" });
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin registros.</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {items.map((s) => {
          const label = s.therapyStatus
            ? therapyStatusLabels[s.therapyStatus]
            : s.evaluationStatus
              ? evaluationStatusLabels[s.evaluationStatus]
              : "—";

          if (editingId === s.id) {
            return (
              <li key={s.id} className="space-y-3 border-b pb-3 text-sm last:border-0">
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <div className="flex gap-2">
                    {(
                      [ServiceType.THERAPY, ServiceType.EVALUATION, ServiceType.PSYCHIATRY]
                    ).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleServiceTypeChange(t)}
                        className={cn(
                          "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          serviceType === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {serviceTypeLabels[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  {serviceType === ServiceType.EVALUATION ? (
                    <Select
                      value={evaluationStatus}
                      onValueChange={(v) => setEvaluationStatus(v as EvaluationStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(evaluationStatusLabels).map(([val, l]) => (
                          <SelectItem key={val} value={val}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={therapyStatus}
                      onValueChange={(v) => setTherapyStatus(v as TherapyStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(therapyStatusLabels).map(([val, l]) => (
                          <SelectItem key={val} value={val}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`notes-${s.id}`}>Nota (opcional)</Label>
                  <Textarea
                    id={`notes-${s.id}`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit}>
                    <X className="mr-1 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => saveEdit(s.id)} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              </li>
            );
          }

          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
            >
              <Badge variant="secondary">{serviceTypeLabels[s.serviceType]}</Badge>
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">
                {formatMxDateTime(s.changedAt)}
                {" · "}
                {s.changedBy.name}
              </span>
              {s.notes && (
                <span className="w-full text-muted-foreground">{s.notes}</span>
              )}
              {canManage && (
                <span className="ml-auto flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Editar"
                    onClick={() => startEdit(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Eliminar"
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar registro del historial</DialogTitle>
            <DialogDescription>
              ¿Eliminar este registro del historial de estados? Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
