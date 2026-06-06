import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ReportsView } from "@/components/reports/reports-view";

export default async function ReportsPage() {
  const session = await auth();
  if (!can(session!.user.role, "reports:read")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes anuales</h1>
        <p className="text-muted-foreground">
          Indicadores operativos y de atención. Descarga en Excel o PDF.
        </p>
      </div>
      <ReportsView />
    </div>
  );
}
