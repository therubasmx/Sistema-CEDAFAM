import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { OrphanEvaluationsList } from "@/components/patients/orphan-evaluations-list";

export default async function OrphanEvaluationsPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "evaluations:read")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <OrphanEvaluationsList />
    </div>
  );
}
