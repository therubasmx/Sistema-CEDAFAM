import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">CEDAFAM</h1>
        <p className="max-w-md text-muted-foreground">
          Sistema de gestión de consultas psicológicas y psiquiátricas.
        </p>
      </div>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/form">Solicitar una cita</Link>
        </Button>
      </div>
    </main>
  );
}
