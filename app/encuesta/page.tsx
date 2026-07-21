"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SurveyForm } from "@/components/forms/survey-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PublicSurveyPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Encuesta de satisfacción — CEDAFAM</CardTitle>
            <CardDescription>
              Tus respuestas son anónimas: no registramos tu nombre ni ningún
              dato que te identifique. Nos ayudan a mejorar la atención.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
                <div>
                  <h2 className="text-lg font-semibold">¡Gracias!</h2>
                  <p className="text-sm text-muted-foreground">
                    Tu respuesta se registró de forma anónima.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </div>
            ) : (
              <SurveyForm onSuccess={() => setSubmitted(true)} />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
