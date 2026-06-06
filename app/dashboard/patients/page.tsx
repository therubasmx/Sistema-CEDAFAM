import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { PatientTable } from "@/components/tables/patient-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PatientsPage() {
  const session = await auth();
  const role = session!.user.role;
  const canCreate = role === Role.ADMIN || role === Role.COORDINATOR;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pacientes</h1>
          <p className="text-muted-foreground">
            {role === Role.PSYCHOLOGIST
              ? "Tus pacientes asignados."
              : "Todos los pacientes registrados."}
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/dashboard/patients/new">Nuevo paciente</Link>
          </Button>
        )}
      </div>
      <PatientTable />
    </div>
  );
}
