import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SolicitudesList } from "@/components/solicitudes/solicitudes-list";

export default async function SolicitudesPage() {
  const session = await auth();
  const user = session!.user;

  if (!can(user.role, "appointments:review")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <SolicitudesList />
    </div>
  );
}
