import { AssignmentsView } from "@/components/assignments/assignments-view";

export default function AssignmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Asignaciones</h1>
        <p className="text-muted-foreground">
          Pacientes pendientes de asignar a un psicólogo.
        </p>
      </div>
      <AssignmentsView />
    </div>
  );
}
