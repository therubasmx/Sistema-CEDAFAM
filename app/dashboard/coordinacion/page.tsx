import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { accessiblePositions } from "@/lib/permissions";
import { coordinationHref } from "@/lib/nav";
import {
  POSITION_ORDER,
  positionDescriptions,
  positionLabels,
} from "@/lib/labels";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Hub de coordinaciones. Solo lo usa el Jefe Principal, que supervisa las seis;
 * quien ocupa un puesto entra directo a su módulo desde la barra lateral, así
 * que se le redirige ahí en lugar de mostrarle un índice de una sola entrada.
 */
export default async function CoordinacionHubPage() {
  const session = await auth();
  const user = session!.user;

  if (user.role !== Role.ADMIN) {
    const own = accessiblePositions(user);
    redirect(own.length > 0 ? coordinationHref(own[0]) : "/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coordinaciones</h1>
        <p className="text-muted-foreground">
          Entra al módulo de cualquiera de las seis coordinaciones.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {POSITION_ORDER.map((position) => (
          <Link key={position} href={coordinationHref(position)}>
            <Card className="h-full transition-colors hover:border-primary hover:bg-accent/40">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  {positionLabels[position]}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardTitle>
                <CardDescription>
                  {positionDescriptions[position]}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
