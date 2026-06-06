import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { ComingSoon } from "@/components/coming-soon";

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user.role !== Role.ADMIN) redirect("/dashboard");
  return <ComingSoon title="Gestión de usuarios" phase="Fase 4" />;
}
