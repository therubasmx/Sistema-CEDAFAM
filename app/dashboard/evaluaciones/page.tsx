import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EvaluacionesList } from "@/components/evaluaciones/evaluaciones-list";

export default async function EvaluacionesPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "evaluations:read")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <EvaluacionesList />
    </div>
  );
}
