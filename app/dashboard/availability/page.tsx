import { auth } from "@/lib/auth";
import { AvailabilityEditor } from "@/components/forms/availability-editor";
import { SetupAttendingProfile } from "@/components/setup-attending-profile";
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
  if (!user.psychologistId) {
    return <SetupAttendingProfile userId={user.id} redirectTo="/dashboard/availability" />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi disponibilidad</h1>
        <p className="text-muted-foreground">
          Define los horarios en que puedes atender. Se usa para sugerir
          asignaciones.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Horarios</CardTitle>
          <CardDescription>Selecciona los bloques disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityEditor psychologistId={user.psychologistId} />
        </CardContent>
      </Card>
    </div>
  );
}
