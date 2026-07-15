import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Navbar } from "@/components/navbar";
import { AnnouncementGate } from "@/components/notifications/announcement-gate";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.COORDINATOR) redirect("/dashboard");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar name={session.user.name ?? "Usuario"} role={session.user.role} />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
      </div>
      <AnnouncementGate />
    </div>
  );
}
