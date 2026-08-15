import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AssignmentsView } from "@/components/assignments/assignments-view";

export default async function AssignmentsPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "assignments:create")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Asignaciones</h1>
        <p className="text-muted-foreground">
          Pacientes pendientes de asignar a un psicólogo.
        </p>
      </div>
      <AssignmentsView />
    </div>
  );
}
