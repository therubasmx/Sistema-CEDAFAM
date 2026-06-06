import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { PsychologistsAvailabilityOverview } from "@/components/availability/psychologists-availability-overview";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AvailabilityPage() {
  const session = await auth();
  const user = session!.user;

  if (user.role === Role.PSYCHOLOGIST) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Disponibilidad de psicólogos</h1>
        <p className="text-muted-foreground">
          Horarios disponibles de cada psicólogo, actualizados automáticamente
          con cada reporte semanal.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Horarios por psicólogo</CardTitle>
          <CardDescription>
            Los bloques marcados corresponden a los horarios que cada psicólogo
            declaró disponibles en su último reporte semanal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PsychologistsAvailabilityOverview />
        </CardContent>
      </Card>
    </div>
  );
}
