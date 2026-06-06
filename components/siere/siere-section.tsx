"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DiscountLevel, Role } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/toast";
import { discountLevelLabels } from "@/lib/labels";

interface SiereApplication {
  id: string;
  discountLevel: DiscountLevel;
  requestedAt: string;
  approvedAt: string | null;
  requestedBy: { name: string };
  approvedBy: { name: string } | null;
}

interface SiereSectionProps {
  patientId: string;
  role: Role;
  canRequest: boolean;
  isEvaluationPatient: boolean;
}

export function SiereSection({
  patientId,
  role,
  canRequest,
  isEvaluationPatient,
}: SiereSectionProps) {
  const { toast } = useToast();
  const [apps, setApps] = useState<SiereApplication[]>([]);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<DiscountLevel>(DiscountLevel.LEVEL_1);
  const [submitting, setSubmitting] = useState(false);

  const canApprove = role === Role.ADMIN || role === Role.COORDINATOR;

  const load = useCallback(async () => {
    const res = await fetch(`/api/siere?patientId=${patientId}`);
    if (res.ok) setApps(await res.json());
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function request() {
    setSubmitting(true);
    const res = await fetch("/api/siere", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, discountLevel: level }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: "No se pudo solicitar", description: d.error, variant: "destructive" });
      return;
    }
    toast({ title: "SIERE solicitado", variant: "success" });
    setOpen(false);
    load();
  }

  async function approve(id: string) {
    const res = await fetch(`/api/siere/${id}/approve`, { method: "PUT" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: "No se pudo aprobar", description: d.error, variant: "destructive" });
      return;
    }
    toast({ title: "SIERE aprobado", variant: "success" });
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>SIERE (beneficencia)</CardTitle>
        {canRequest && !isEvaluationPatient && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Solicitar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isEvaluationPatient ? (
          <p className="text-sm text-muted-foreground">
            SIERE aplica a terapias, no a evaluaciones.
          </p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin solicitudes SIERE.</p>
        ) : (
          <ul className="space-y-2">
            {apps.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
              >
                <Badge variant="secondary">{discountLevelLabels[a.discountLevel]}</Badge>
                {a.approvedAt ? (
                  <Badge variant="success">Aprobado</Badge>
                ) : (
                  <Badge variant="warning">Pendiente</Badge>
                )}
                <span className="text-muted-foreground">
                  Solicitó {a.requestedBy.name} ·{" "}
                  {format(new Date(a.requestedAt), "d MMM yyyy", { locale: es })}
                </span>
                {canApprove && !a.approvedAt && (
                  <Button size="sm" variant="outline" onClick={() => approve(a.id)}>
                    Aprobar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar SIERE</DialogTitle>
            <DialogDescription>
              Selecciona el nivel de descuento para el paciente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nivel de descuento</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as DiscountLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DiscountLevel).map((l) => (
                    <SelectItem key={l} value={l}>
                      {discountLevelLabels[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={request} disabled={submitting}>
                {submitting ? "Solicitando…" : "Solicitar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
