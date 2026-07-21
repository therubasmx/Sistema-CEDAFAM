import { notFound, redirect } from "next/navigation";
import { EventKind, EventScope, Position } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessPosition } from "@/lib/permissions";
import { positionFromSlug, positionLabels } from "@/lib/labels";
import { LeaveRequestsView } from "@/components/leave/leave-requests-view";
import { CoordinationOverview } from "@/components/coordination/coordination-overview";
import { EventModuleView } from "@/components/events/event-module-view";
import { BirthdaysView } from "@/components/events/birthdays-view";
import { SurveyResultsView } from "@/components/surveys/survey-results-view";

type Props = { params: Promise<{ slug: string }> };

/** Bajada bajo el título de cada módulo. */
const MODULE_BLURB: Record<Position, string> = {
  PRIVATE_CARE_SERVICES:
    "Resumen e historial de lo que está haciendo cada coordinación.",
  PROFESSIONAL_DEVELOPMENT:
    "Solicitudes de permiso de los psicólogos. Al aceptar una, ese horario se bloquea en su agenda.",
  COMMUNITY_OUTREACH:
    "Eventos con la comunidad. Solo los psicólogos invitados reciben aviso y ven su agenda bloqueada.",
  HUMAN_CAPITAL:
    "Eventos internos. Se avisa a todo el equipo y se bloquea la agenda de todos.",
  BIRTHDAYS: "Festejos del equipo y el registro de fechas de cumpleaños.",
  INNOVATION_RESEARCH:
    "Resultados de la encuesta de satisfacción. Las respuestas son anónimas.",
};

/**
 * Módulo de una coordinación. El slug de la URL se resuelve al puesto y se
 * verifica el acceso: solo entra su titular, más el Jefe Principal.
 */
export default async function CoordinacionModulePage({ params }: Props) {
  const { slug } = await params;
  const position = positionFromSlug(slug);
  if (!position) notFound();

  const session = await auth();
  const user = session!.user;
  if (!canAccessPosition(user, position)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{positionLabels[position]}</h1>
        <p className="text-muted-foreground">{MODULE_BLURB[position]}</p>
      </div>
      <ModuleBody position={position} />
    </div>
  );
}

function ModuleBody({ position }: { position: Position }) {
  switch (position) {
    case Position.PRIVATE_CARE_SERVICES:
      return <CoordinationOverview />;
    case Position.PROFESSIONAL_DEVELOPMENT:
      return <LeaveRequestsView />;
    case Position.COMMUNITY_OUTREACH:
      return (
        <EventModuleView
          kind={EventKind.COMMUNITY}
          scope={EventScope.SELECTED}
          blurb="Cada evento bloquea la agenda únicamente de quienes invites."
        />
      );
    case Position.HUMAN_CAPITAL:
      return (
        <EventModuleView
          kind={EventKind.HUMAN_CAPITAL}
          scope={EventScope.ALL}
          blurb="Cada evento bloquea la agenda de todo el equipo."
        />
      );
    case Position.BIRTHDAYS:
      return <BirthdaysView />;
    case Position.INNOVATION_RESEARCH:
      return <SurveyResultsView />;
    default:
      return null;
  }
}
