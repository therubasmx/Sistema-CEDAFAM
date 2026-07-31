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
            showCedafamFolio={false}
            onSuccess={(data) => {
              const { id, cedafamFolio } = data as { id: string; cedafamFolio: string | null };
              toast({
                title: "Paciente registrado",
                description: cedafamFolio ? `Expediente CEDAFAM: ${cedafamFolio}` : undefined,
                variant: "success",
              });
              router.push(`/dashboard/patients/${id}`);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
