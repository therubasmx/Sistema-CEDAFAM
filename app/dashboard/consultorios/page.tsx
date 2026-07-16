import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ConsultoriosBoard } from "@/components/consultorios/consultorios-board";

export default async function ConsultoriosPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "appointments:assignRoom")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Consultorios</h1>
        <p className="text-muted-foreground">
          Arrastra cada paciente agendado al consultorio donde tomará su sesión.
          No puede haber dos sesiones a la misma hora en un mismo consultorio.
        </p>
      </div>
      <ConsultoriosBoard />
    </div>
  );
}
