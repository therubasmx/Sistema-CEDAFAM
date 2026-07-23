import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DuplicatesReviewTabs } from "@/components/patients/duplicates-review-tabs";

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
          existente, y expedientes ya existentes que podrían ser la misma
          persona. Revisa y decide en cada caso.
        </p>
      </div>
      <DuplicatesReviewTabs />
    </div>
  );
}
