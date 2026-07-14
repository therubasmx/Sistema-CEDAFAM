import { auth } from "@/lib/auth";
import { CalendarView } from "@/components/calendar/calendar-view";

type CalendarPageProps = {
  searchParams: Promise<{ psychologistId?: string; view?: string }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const session = await auth();
  const user = session!.user;
  const { psychologistId: filterPsy, view } = await searchParams;
  const initialView =
    view === "day" || view === "week" || view === "month" ? view : undefined;

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
      <CalendarView
        role={user.role}
        psychologistId={user.psychologistId}
        initialFilterPsy={filterPsy}
        initialView={initialView}
      />
    </div>
  );
}
