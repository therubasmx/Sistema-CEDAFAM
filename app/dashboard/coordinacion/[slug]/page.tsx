import { notFound, redirect } from "next/navigation";
import { EventKind, EventScope, Position } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessPosition, canViewPosition } from "@/lib/permissions";
import { positionFromSlug, positionLabels } from "@/lib/labels";
import { LeaveRequestsView } from "@/components/leave/leave-requests-view";
import { CaseStudyView } from "@/components/leave/case-study-view";
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
 * verifica el acceso: entra su titular y el Jefe Principal a administrarlo,
 * y Atención Privada a mirarlo (`readOnly`).
 */
export default async function CoordinacionModulePage({ params }: Props) {
  const { slug } = await params;
  const position = positionFromSlug(slug);
  if (!position) notFound();

  const session = await auth();
  const user = session!.user;
  if (!canViewPosition(user, position)) {
    redirect("/dashboard");
  }
  // Atención Privada entra a los otros cinco módulos, pero solo a mirar: no
  // administra el suyo.
  const readOnly = !canAccessPosition(user, position);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{positionLabels[position]}</h1>
        <p className="text-muted-foreground">{MODULE_BLURB[position]}</p>
      </div>
      <ModuleBody position={position} readOnly={readOnly} />
    </div>
  );
}

function ModuleBody({
  position,
  readOnly,
}: {
  position: Position;
  readOnly: boolean;
}) {
  switch (position) {
    case Position.PRIVATE_CARE_SERVICES:
      return <CoordinationOverview />;
    case Position.PROFESSIONAL_DEVELOPMENT:
      return (
        <div className="space-y-10">
          <LeaveRequestsView readOnly={readOnly} />
          <CaseStudyView readOnly={readOnly} />
        </div>
      );
    case Position.COMMUNITY_OUTREACH:
      return (
        <EventModuleView
          kind={EventKind.COMMUNITY}
          scope={EventScope.SELECTED}
          blurb="Cada evento bloquea la agenda únicamente de quienes invites."
          readOnly={readOnly}
        />
      );
    case Position.HUMAN_CAPITAL:
      return (
        <EventModuleView
          kind={EventKind.HUMAN_CAPITAL}
          scope={EventScope.ALL}
          blurb="Cada evento bloquea la agenda de todo el equipo."
          readOnly={readOnly}
        />
      );
    case Position.BIRTHDAYS:
      return <BirthdaysView readOnly={readOnly} />;
    case Position.INNOVATION_RESEARCH:
      return <SurveyResultsView />;
    default:
      return null;
  }
}
