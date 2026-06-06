"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ServiceType,
  TherapyStatus,
  EvaluationStatus,
} from "@prisma/client";
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
import { useToast } from "@/components/ui/toast";
import {
  serviceTypeLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
} from "@/lib/labels";

export function StatusForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.THERAPY);
  const [therapyStatus, setTherapyStatus] = useState<TherapyStatus | "">("");
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/patients/${patientId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType,
        therapyStatus: serviceType === ServiceType.THERAPY ? therapyStatus : null,
        evaluationStatus:
          serviceType === ServiceType.EVALUATION ? evaluationStatus : null,
        notes,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({
        title: "No se pudo guardar",
        description: data.error,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Estado actualizado", variant: "success" });
    setNotes("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de servicio</Label>
          <Select
            value={serviceType}
            onValueChange={(v) => setServiceType(v as ServiceType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ServiceType).map((t) => (
                <SelectItem key={t} value={t}>
                  {serviceTypeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Estado</Label>
          {serviceType === ServiceType.THERAPY ? (
            <Select
              value={therapyStatus}
              onValueChange={(v) => setTherapyStatus(v as TherapyStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(TherapyStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {therapyStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={evaluationStatus}
              onValueChange={(v) => setEvaluationStatus(v as EvaluationStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(EvaluationStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {evaluationStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Guardando…" : "Registrar estado"}
      </Button>
    </form>
  );
}
