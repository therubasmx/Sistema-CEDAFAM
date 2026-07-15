"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ServiceArea, ReferenceType, TimeSlot } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  serviceAreaLabels,
  referenceTypeLabels,
  timeSlotLabels,
} from "@/lib/labels";

export interface PendingPatient {
  id: string;
  fullName: string;
  fileNumber: string | null;
  cedafamFolio: string | null;
  age: number;
  curp: string | null;
  phoneNumber: string;
  address: string | null;
  postalCode: string | null;
  email: string | null;
  serviceArea: ServiceArea;
  referenceType: ReferenceType;
  consultationReason: string;
  preferredTimeSlot: TimeSlot;
  createdAt: string;
}

interface PatientDetailDialogProps {
  patient: PendingPatient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAssign: boolean;
  /** Called when the user chooses to assign from within this dialog. */
  onAssign: () => void;
}

export function PatientDetailDialog({
  patient,
  open,
  onOpenChange,
  canAssign,
  onAssign,
}: PatientDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient.fullName}</DialogTitle>
          <DialogDescription>
            {patient.age} años · {serviceAreaLabels[patient.serviceArea]} · Recibido{" "}
            {format(new Date(patient.createdAt), "d MMM yyyy", { locale: es })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <Field label="Expediente hospital" value={patient.fileNumber ?? "—"} />
          <Field label="Folio CEDAFAM" value={patient.cedafamFolio ?? "—"} />
          <Field label="Teléfono" value={patient.phoneNumber} />
          <Field label="Correo" value={patient.email ?? "—"} />
          <Field label="CURP" value={patient.curp ?? "—"} />
          <Field label="Código postal" value={patient.postalCode ?? "—"} />
          <Field label="Dirección" value={patient.address ?? "—"} />
          <Field
            label="Horario preferido"
            value={timeSlotLabels[patient.preferredTimeSlot]}
          />
          <Field
            label="Referencia"
            value={referenceTypeLabels[patient.referenceType]}
          />
          <div className="pt-1">
            <p className="font-medium text-muted-foreground">Motivo de consulta</p>
            <p>{patient.consultationReason}</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/patients/${patient.id}`}>
              Ver expediente completo
            </Link>
          </Button>
          {canAssign && <Button onClick={onAssign}>Asignar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
