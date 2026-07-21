"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { formatMxDateTime } from "@/lib/utils";

interface AssignmentHistoryItem {
  id: string;
  psychologistId: string;
  psychologistName: string;
  assignedAt: string | Date;
  assignedByName: string;
  isExploratorySession: boolean;
  isActive: boolean;
}

interface PsychologistOption {
  id: string;
  name: string;
}

export function AssignmentHistoryList({
  patientId,
  initialItems,
  canManage,
}: {
  patientId: string;
  initialItems: AssignmentHistoryItem[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState(initialItems);
  const [psychologists, setPsychologists] = useState<PsychologistOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentHistoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [psychologistId, setPsychologistId] = useState("");
  const [exploratory, setExploratory] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/psychologists")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; name: string }[]) => setPsychologists(data));
  }, [canManage]);

  function startEdit(item: AssignmentHistoryItem) {
    setEditingId(item.id);
    setPsychologistId(item.psychologistId);
    setExploratory(item.isExploratorySession);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!psychologistId) {
      toast({ title: "Selecciona un psicólogo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/patients/${patientId}/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ psychologistId, isExploratorySession: exploratory }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Error al guardar", description: data.error, variant: "destructive" });
      return;
    }

    const name = psychologists.find((p) => p.id === psychologistId)?.name ?? "";
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, psychologistId, psychologistName: name, isExploratorySession: exploratory }
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
    const res = await fetch(
      `/api/patients/${patientId}/assignments/${deleteTarget.id}`,
      { method: "DELETE" },
    );
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
        {items.map((a) => {
          if (editingId === a.id) {
            return (
              <li key={a.id} className="space-y-3 border-b pb-3 text-sm last:border-0">
                <div className="space-y-1.5">
                  <Label>Psicólogo</Label>
                  <Select value={psychologistId} onValueChange={setPsychologistId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un psicólogo" />
                    </SelectTrigger>
                    <SelectContent>
                      {psychologists.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exploratory}
                    onChange={(e) => setExploratory(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Sesión de exploración
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEdit}>
                    <X className="mr-1 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => saveEdit(a.id)} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                  </Button>
                </div>
              </li>
            );
          }

          return (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
            >
              {a.isActive && <Badge variant="secondary">Activo</Badge>}
              {a.isExploratorySession && <Badge variant="outline">Exploración</Badge>}
              <span className="font-medium">{a.psychologistName}</span>
              <span className="text-muted-foreground">
                {formatMxDateTime(a.assignedAt)}
                {" · asignado por "}
                {a.assignedByName}
              </span>
              {canManage && (
                <span className="ml-auto flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Editar"
                    onClick={() => startEdit(a)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Eliminar"
                    onClick={() => setDeleteTarget(a)}
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
              ¿Eliminar este registro de asignación
              {deleteTarget?.isActive
                ? ". Como es la asignación activa, se restaurará la anterior (si existe)"
                : ""}
              ? Esta acción no se puede deshacer.
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
