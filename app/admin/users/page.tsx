import { auth } from "@/lib/auth";
import { UsersView } from "@/components/admin/users-view";

export default async function AdminUsersPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestión de usuarios</h1>
        <p className="text-muted-foreground">
          Crea y administra las cuentas del personal de CEDAFAM.
        </p>
      </div>
      <UsersView currentUserId={session!.user.id} />
    </div>
  );
}
