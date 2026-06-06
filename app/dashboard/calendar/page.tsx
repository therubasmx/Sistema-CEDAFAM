import { auth } from "@/lib/auth";
import { CalendarView } from "@/components/calendar/calendar-view";

export default async function CalendarPage() {
  const session = await auth();
  const user = session!.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendario</h1>
        <p className="text-muted-foreground">
          {user.role === "PSYCHOLOGIST"
            ? "Tus citas de la semana."
            : "Citas de todos los psicólogos."}
        </p>
      </div>
      <CalendarView role={user.role} psychologistId={user.psychologistId} />
    </div>
  );
}
