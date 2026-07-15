"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ServiceType, TherapyStatus, EvaluationStatus } from "@prisma/client";
import { Pencil, X, UserMinus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { AssignDialog } from "@/components/assignments/assign-dialog";
import { cn } from "@/lib/utils";

const DISCHARGE_STATUSES: TherapyStatus[] = [
  TherapyStatus.THERAPEUTIC_DISCHARGE,
  TherapyStatus.VOLUNTARY_DISCHARGE,
];

function isDischarge(status: CurrentStatus | null): boolean {
  return (
    !!status &&
    status.serviceType !== ServiceType.EVALUATION &&
    !!status.therapyStatus &&
    DISCHARGE_STATUSES.includes(status.therapyStatus)
  );
}

function getStatusLabel(status: CurrentStatus): string {
  if (status.serviceType === ServiceType.EVALUATION) {
    return status.evaluationStatus ? evaluationStatusLabels[status.evaluationStatus] : "—";
  }
  return status.therapyStatus ? therapyStatusLabels[status.therapyStatus] : "—";
}

interface CurrentStatus {
  serviceType: ServiceType;
  therapyStatus: TherapyStatus | null;
  evaluationStatus: EvaluationStatus | null;
}

interface CurrentAssignment {
  psychologistId: string;
  psychologistName: string;
}

interface PatientStatusModuleProps {
  patientId: string;
  patientName: string;
  initialStatus: CurrentStatus | null;
  initialAssignment: CurrentAssignment | null;
  canAssign: boolean;
}

export function PatientStatusModule({
  patientId,
  patientName,
  initialStatus,
  initialAssignment,
  canAssign,
}: PatientStatusModuleProps) {
  const { toast } = useToast();
  const router = useRouter();

  const [currentStatus, setCurrentStatus] = useState<CurrentStatus | null>(initialStatus);
  const [editing, setEditing] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>(
    initialStatus?.serviceType ?? ServiceType.THERAPY,
  );
  const [therapyStatus, setTherapyStatus] = useState<TherapyStatus | "">(
    initialStatus && initialStatus.serviceType !== ServiceType.EVALUATION
      ? (initialStatus.therapyStatus ?? "")
      : "",
  );
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | "">(
    initialStatus?.serviceType === ServiceType.EVALUATION
      ? (initialStatus.evaluationStatus ?? "")
      : "",
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [assignment, setAssignment] = useState<CurrentAssignment | null>(initialAssignment);
  const [assignOpen, setAssignOpen] = useState(false);

  const discharged = isDischarge(currentStatus);

  function handleServiceTypeChange(val: ServiceType) {
    setServiceType(val);
    setTherapyStatus("");
    setEvaluationStatus("");
  }

  function handleCancelEdit() {
    setServiceType(currentStatus?.serviceType ?? ServiceType.THERAPY);
    setTherapyStatus(
      currentStatus && currentStatus.serviceType !== ServiceType.EVALUATION
        ? (currentStatus.therapyStatus ?? "")
        : "",
    );
    setEvaluationStatus(
      currentStatus?.serviceType === ServiceType.EVALUATION
        ? (currentStatus.evaluationStatus ?? "")
        : "",
    );
    setNotes("");
    setEditing(false);
  }

  async function handleSaveStatus() {
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
    if (notes.trim()) body.notes = notes.trim();

    setSaving(true);
    const res = await fetch(`/api/patients/${patientId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: "Error al guardar", description: data.error, variant: "destructive" });
      return;
    }

    const newStatus: CurrentStatus = {
      serviceType,
      therapyStatus:
        serviceType === ServiceType.EVALUATION ? null : (therapyStatus as TherapyStatus),
      evaluationStatus:
        serviceType === ServiceType.EVALUATION
          ? (evaluationStatus as EvaluationStatus)
          : null,
    };
    setCurrentStatus(newStatus);
    setEditing(false);
    setNotes("");
    toast({ title: "Estado actualizado", variant: "success" });
    router.refresh();
  }

  async function handleAssigned() {
    const res = await fetch(`/api/patients/${patientId}`);
    if (res.ok) {
      const data = await res.json();
      const active = data.assignments?.find(
        (a: { isActive: boolean; psychologistId: string; psychologist: { user: { name: string } } }) => a.isActive,
      );
      if (active) {
        setAssignment({
          psychologistId: active.psychologistId,
          psychologistName: active.psychologist.user.name,
        });
      }
    }
    setAssignOpen(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          Estado del paciente
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              Editar
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status display */}
        {!editing && (
          <div className="flex items-center gap-2">
            {currentStatus ? (
              <>
                <Badge variant="outline">
                  {serviceTypeLabels[currentStatus.serviceType]}
                </Badge>
                <span className="text-sm font-medium">{getStatusLabel(currentStatus)}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Sin estado asignado</span>
            )}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <div className="flex gap-2">
                {(
                  [
                    ServiceType.THERAPY,
                    ServiceType.EVALUATION,
                    ServiceType.PSYCHIATRY,
                  ] as ServiceType[]
                ).map((t) => (
                  <button
                    key={t}
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
                    {Object.entries(evaluationStatusLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
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
                    {Object.entries(therapyStatusLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status-notes">Nota (opcional)</Label>
              <Textarea
                id="status-notes"
                placeholder="¿Por qué se colocó este estado?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                <X className="mr-1 h-4 w-4" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveStatus} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        )}

        {/* Psychologist assignment */}
        <div
          className={cn(
            "space-y-2 border-t pt-4",
            discharged && "pointer-events-none opacity-50",
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Psicólogo asignado
              </p>
              <p className="text-sm font-semibold">
                {assignment?.psychologistName ?? "Sin asignar"}
              </p>
            </div>
            {canAssign && (
              <Button
                size="sm"
                variant="outline"
                disabled={discharged}
                onClick={() => setAssignOpen(true)}
              >
                {assignment ? "Reasignar" : "Asignar"}
              </Button>
            )}
          </div>
          {discharged && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserMinus className="h-3 w-3" />
              Asignación desactivada durante el alta.
            </p>
          )}
        </div>
      </CardContent>

      {assignOpen && (
        <AssignDialog
          patientId={patientId}
          patientName={patientName}
          open={assignOpen}
          onOpenChange={(o) => !o && setAssignOpen(false)}
          onAssigned={handleAssigned}
        />
      )}
    </Card>
  );
}
