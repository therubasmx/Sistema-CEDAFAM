import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { IntakeMatchesList } from "@/components/patients/intake-matches-list";

export default async function IntakeMatchesPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "patients:reviewMatch")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Posibles duplicados</h1>
        <p className="text-muted-foreground">
          Solicitudes del formulario público que coinciden con un expediente
          existente. Revisa y decide si se actualiza, se reactiva, o es una
          persona distinta.
        </p>
      </div>
      <IntakeMatchesList />
    </div>
  );
}
