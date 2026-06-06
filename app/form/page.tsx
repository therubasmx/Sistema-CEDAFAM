"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PatientForm } from "@/components/forms/patient-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PublicFormPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Solicitud de cita — CEDAFAM</CardTitle>
            <CardDescription>
              Completa tus datos. Nuestro equipo de coordinación te contactará
              para confirmar tu cita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
                <div>
                  <h2 className="text-lg font-semibold">¡Solicitud recibida!</h2>
                  <p className="text-sm text-muted-foreground">
                    Gracias por registrarte. Te contactaremos pronto.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </div>
            ) : (
              <PatientForm
                endpoint="/api/public/patients"
                submitLabel="Enviar solicitud"
                onSuccess={() => setSubmitted(true)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
