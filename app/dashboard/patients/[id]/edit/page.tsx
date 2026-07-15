"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PatientForm, type PatientFormValues } from "@/components/forms/patient-form";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format } from "date-fns";

export default function EditPatientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<Partial<PatientFormValues> | null>(null);

  useEffect(() => {
    fetch(`/api/patients/${id}`)
      .then((r) => r.json())
      .then((p) => {
        setDefaults({
          fullName: p.fullName ?? "",
          fileNumber: p.fileNumber ?? "",
          cedafamFolio: p.cedafamFolio ?? "",
          age: p.age != null ? String(p.age) : "",
          dateOfBirth: p.dateOfBirth
            ? format(new Date(p.dateOfBirth), "yyyy-MM-dd")
            : "",
          curp: p.curp ?? "",
          phoneNumber: p.phoneNumber ?? "",
          address: p.address ?? "",
          postalCode: p.postalCode ?? "",
          email: p.email ?? "",
          serviceArea: p.serviceArea ?? "",
          referenceType: p.referenceType,
          consultationReason: p.consultationReason ?? "",
          preferredTimeSlot: p.preferredTimeSlot ?? "",
        });
      });
  }, [id]);

  if (!defaults) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-muted-foreground text-sm">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Editar paciente</CardTitle>
          <CardDescription>Modifica la información personal del paciente.</CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm
            endpoint={`/api/patients/${id}`}
            method="PUT"
            defaultValues={defaults}
            submitLabel="Guardar cambios"
            onSuccess={() => {
              toast({ title: "Paciente actualizado", variant: "success" });
              router.push(`/dashboard/patients/${id}`);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
