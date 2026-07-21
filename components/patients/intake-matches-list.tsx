"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Inbox } from "lucide-react";
import { AppointmentStatus, ReferenceType, ServiceArea, TimeSlot } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { serviceAreaLabels } from "@/lib/labels";
import { getLastActivityAt, isExpedienteVigente } from "@/lib/patient-status";

interface SubmittedData {
  fullName: string;
  age: number;
  dateOfBirth: string;
  curp: string;
  phoneNumber: string;
  address: string;
  postalCode: string;
  email: string;
  serviceArea: ServiceArea;
  referenceType: ReferenceType;
  consultationReason: string;
  preferredTimeSlot: TimeSlot;
}

interface MatchedPatient {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  curp: string | null;
  phoneNumber: string;
  serviceArea: ServiceArea;
  consultationReason: string;
  createdAt: string;
  appointments: { scheduledAt: string; status: AppointmentStatus }[];
  statuses: { changedAt: string }[];
}

interface IntakeMatchItem {
  id: string;
  submittedData: SubmittedData;
  matchedByField: "curp" | "dateOfBirth" | "phoneNumber";
  createdAt: string;
  matchedPatient: MatchedPatient;
}

const matchedByFieldLabels: Record<IntakeMatchItem["matchedByField"], string> = {
  curp: "CURP",
  dateOfBirth: "fecha de nacimiento",
  phoneNumber: "teléfono",
};

function formatDate(value: string | Date): string {
  return format(new Date(value), "d MMM yyyy", { locale: es });
}

export function IntakeMatchesList() {
  const { toast } = useToast();
  const [items, setItems] = useState<IntakeMatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<IntakeMatchItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/patients/intake-matches");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openItem(item: IntakeMatchItem) {
    setSelected(item);
    setError(null);
  }

  async function decide(decision: "APPLY" | "CREATE_NEW") {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/patients/intake-matches/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo procesar la solicitud.");
      return;
    }
    toast({
      title:
        decision === "APPLY" ? "Expediente actualizado" : "Expediente nuevo creado",
      variant: "success",
    });
    setItems((prev) => prev.filter((i) => i.id !== selected.id));
    setSelected(null);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-16 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No hay solicitudes por revisar. 🎉
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const vigente = isExpedienteVigente(item.matchedPatient);
          return (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-3 rounded-md border bg-card p-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-semibold">
                    {item.submittedData.fullName}
                  </p>
                  <Badge variant={vigente ? "success" : "destructive"}>
                    {vigente ? "Vigente" : "Caducado"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Coincide por {matchedByFieldLabels[item.matchedByField]}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => openItem(item)}>
                Revisar
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Posible expediente existente</DialogTitle>
                <DialogDescription>
                  {selected.submittedData.fullName} envió una solicitud y coincide
                  con un expediente{" "}
                  {isExpedienteVigente(selected.matchedPatient) ? "vigente" : "caducado"}{" "}
                  por {matchedByFieldLabels[selected.matchedByField]}. Compara los
                  datos y decide.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium text-muted-foreground">
                    Solicitud nueva
                  </p>
                  <dl className="space-y-1">
                    <Field label="Nombre" value={selected.submittedData.fullName} />
                    <Field label="CURP" value={selected.submittedData.curp} />
                    <Field
                      label="F. nacimiento"
                      value={formatDate(selected.submittedData.dateOfBirth)}
                    />
                    <Field
                      label="Teléfono"
                      value={selected.submittedData.phoneNumber}
                    />
                    <Field
                      label="Área"
                      value={serviceAreaLabels[selected.submittedData.serviceArea]}
                    />
                  </dl>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-muted-foreground">
                    Expediente encontrado
                  </p>
                  <dl className="space-y-1">
                    <Field label="Nombre" value={selected.matchedPatient.fullName} />
                    <Field label="CURP" value={selected.matchedPatient.curp ?? "—"} />
                    <Field
                      label="F. nacimiento"
                      value={
                        selected.matchedPatient.dateOfBirth
                          ? formatDate(selected.matchedPatient.dateOfBirth)
                          : "—"
                      }
                    />
                    <Field
                      label="Teléfono"
                      value={selected.matchedPatient.phoneNumber}
                    />
                    <Field
                      label="Última actividad"
                      value={formatDate(getLastActivityAt(selected.matchedPatient))}
                    />
                  </dl>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => decide("CREATE_NEW")}
                >
                  Es otra persona, crear expediente nuevo
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => decide("APPLY")}
                >
                  {submitting
                    ? "Procesando…"
                    : isExpedienteVigente(selected.matchedPatient)
                      ? "Actualizar expediente"
                      : "Reactivar paciente"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
