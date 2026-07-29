import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { AvailabilityTabs } from "@/components/availability/availability-tabs";

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
      <AvailabilityTabs />
    </div>
  );
}
