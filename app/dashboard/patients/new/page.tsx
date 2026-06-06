"use client";

import { useRouter } from "next/navigation";
import { PatientForm } from "@/components/forms/patient-form";
import { useToast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewPatientPage() {
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo paciente</CardTitle>
          <CardDescription>
            Registra un paciente manualmente. Coordinación será notificada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm
            endpoint="/api/patients"
            submitLabel="Registrar paciente"
            onSuccess={(data) => {
              toast({ title: "Paciente registrado", variant: "success" });
              const id = (data as { id: string }).id;
              router.push(`/dashboard/patients/${id}`);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
