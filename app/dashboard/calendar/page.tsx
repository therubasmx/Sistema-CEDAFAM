import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CalendarView } from "@/components/calendar/calendar-view";

type CalendarPageProps = {
  searchParams: Promise<{
    psychologistId?: string;
    view?: string;
    appointmentId?: string;
  }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const session = await auth();
  const user = session!.user;
  const { psychologistId: filterPsy, view, appointmentId } = await searchParams;
  const initialView =
    view === "day" || view === "week" || view === "month" ? view : undefined;

  // Coordinación del usuario (para etiquetar eventos que cree).
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { coordination: true },
  });

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
        coordination={dbUser?.coordination ?? null}
        initialFilterPsy={filterPsy}
        initialView={initialView}
        initialAppointmentId={appointmentId}
      />
    </div>
  );
}
