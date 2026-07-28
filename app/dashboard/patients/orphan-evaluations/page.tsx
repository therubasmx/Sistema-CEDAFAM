import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { FoliosTabs } from "@/components/patients/folios-tabs";

export default async function FoliosPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "evaluations:read")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Folios</h1>
        <p className="text-muted-foreground">
          Folios de evaluación emitidos, ligados a un expediente o pendientes de
          vincular.
        </p>
      </div>
      <FoliosTabs />
    </div>
  );
}
