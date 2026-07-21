"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function DeletePatientButton({
  patientId,
  patientName,
  hasLinkedData,
}: {
  patientId: string;
  patientName: string;
  hasLinkedData: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    const res = await fetch(`/api/patients/${patientId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo eliminar",
        description: d.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Paciente eliminado", variant: "success" });
    router.push("/dashboard/patients");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Eliminar
      </Button>

      <Dialog open={open} onOpenChange={(o) => !deleting && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar paciente</DialogTitle>
            <DialogDescription>
              ¿Eliminar el expediente de {patientName}?{" "}
              {hasLinkedData
                ? "Tiene citas, asignaciones o historial registrados: se eliminarán junto con el expediente."
                : "No tiene citas, asignaciones ni historial registrados."}{" "}
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
