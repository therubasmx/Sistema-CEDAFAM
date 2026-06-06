import Link from "next/link";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { roleLabels } from "@/lib/labels";

function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number | string;
  href?: string;
}) {
  const body = (
    <Card className={href ? "transition-colors hover:bg-accent" : undefined}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardHome() {
  const session = await auth();
  const user = session!.user;
  const role = user.role;

  // Build role-specific stats.
  if (role === Role.PSYCHOLOGIST) {
    const psychologistId = user.psychologistId ?? "";
    const [activePatients, exploratory] = await Promise.all([
      db.patientAssignment.count({
        where: { psychologistId, isActive: true, isExploratorySession: false },
      }),
      db.patientAssignment.count({
        where: { psychologistId, isActive: true, isExploratorySession: true },
      }),
    ]);
    return (
      <Welcome name={user.name} role={role}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Mis pacientes activos"
            value={activePatients}
            href="/dashboard/patients"
          />
          <StatCard title="Sesiones de exploración" value={exploratory} />
        </div>
      </Welcome>
    );
  }

  // Admin / Coordinator / Accountant — global view.
  const [totalPatients, unassigned, activeAssignments, psychologists] =
    await Promise.all([
      db.patient.count(),
      db.patient.count({ where: { assignments: { none: { isActive: true } } } }),
      db.patientAssignment.count({ where: { isActive: true } }),
      db.psychologist.count({ where: { isActive: true } }),
    ]);

  const canAssign = role === Role.ADMIN || role === Role.COORDINATOR;

  return (
    <Welcome name={user.name} role={role}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pacientes totales"
          value={totalPatients}
          href="/dashboard/patients"
        />
        <StatCard
          title="Sin asignar"
          value={unassigned}
          href={canAssign ? "/dashboard/assignments" : "/dashboard/patients"}
        />
        <StatCard title="Asignaciones activas" value={activeAssignments} />
        <StatCard title="Psicólogos activos" value={psychologists} />
      </div>
    </Welcome>
  );
}

function Welcome({
  name,
  role,
  children,
}: {
  name?: string | null;
  role: Role;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {name ?? "Usuario"}</h1>
        <p className="text-muted-foreground">{roleLabels[role]}</p>
      </div>
      {children}
    </div>
  );
}
