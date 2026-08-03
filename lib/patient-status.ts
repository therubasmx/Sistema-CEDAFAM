import { subYears } from "date-fns";
import {
  AppointmentStatus,
  TherapyStatus,
  EvaluationStatus,
  type Prisma,
} from "@prisma/client";

export const EXPEDIENTE_VIGENTE_YEARS = 5;

/** Estados de evaluación que cierran el caso (ya no requieren seguimiento). */
const EVALUATION_EXIT_STATUSES: EvaluationStatus[] = [
  EvaluationStatus.EVALUATION_COMPLETED,
  EvaluationStatus.REFERRAL,
  EvaluationStatus.CANCELLED,
];

/**
 * Estados de salida (cualquier terapia no-activa, o evaluación finalizada,
 * canalizada o cancelada) liberan el cupo del psicólogo en "Capacidad de
 * psicólogos" y sacan al paciente del reporte semanal de la semana siguiente.
 */
export function freesCapacity(
  therapyStatus: TherapyStatus | null,
  evaluationStatus: EvaluationStatus | null,
): boolean {
  return (
    (!!therapyStatus && therapyStatus !== TherapyStatus.ACTIVE) ||
    (!!evaluationStatus && EVALUATION_EXIT_STATUSES.includes(evaluationStatus))
  );
}

interface ActivityAppointment {
  scheduledAt: Date | string;
  status: AppointmentStatus;
}

interface ActivityStatus {
  changedAt: Date | string;
}

export interface PatientActivity {
  createdAt: Date | string;
  appointments?: ActivityAppointment[];
  statuses?: ActivityStatus[];
}

/**
 * Última señal de actividad de un expediente: la cita agendada/atendida más
 * reciente, o el cambio de estatus más reciente, lo que sea más nuevo. Sin
 * ninguna de las dos, se cuenta desde la apertura del expediente.
 */
export function getLastActivityAt(patient: PatientActivity): Date {
  const dates = [new Date(patient.createdAt)];

  for (const a of patient.appointments ?? []) {
    if (a.status === AppointmentStatus.SCHEDULED || a.status === AppointmentStatus.ATTENDED) {
      dates.push(new Date(a.scheduledAt));
    }
  }
  for (const s of patient.statuses ?? []) {
    dates.push(new Date(s.changedAt));
  }

  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

/** Vigente si tuvo actividad dentro de los últimos 5 años; caducado si no. */
export function isExpedienteVigente(patient: PatientActivity, now: Date = new Date()): boolean {
  return getLastActivityAt(patient) >= subYears(now, EXPEDIENTE_VIGENTE_YEARS);
}

/**
 * Include de Prisma reutilizable para calcular vigencia sin cargar todo el
 * historial: solo la cita agendada/atendida y el cambio de estatus más
 * recientes.
 */
export const activityInclude = {
  appointments: {
    where: { status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ATTENDED] } },
    orderBy: { scheduledAt: "desc" as const },
    take: 1,
  },
  statuses: { orderBy: { changedAt: "desc" as const }, take: 1 },
} satisfies Prisma.PatientInclude;

export type PatientWithActivity = Prisma.PatientGetPayload<{ include: typeof activityInclude }>;

/**
 * `activityInclude` más los conteos de historial que usa la comparación de
 * posibles duplicados (lista y detalle deben traer la misma forma, porque la
 * lista abre el diálogo de comparación directo con esos datos, sin volver a
 * pedir el detalle).
 */
export const patientDuplicateCompareInclude = {
  ...activityInclude,
  _count: {
    select: {
      appointments: true,
      statuses: true,
      assignments: true,
      siere: true,
      evaluationFolios: true,
    },
  },
} satisfies Prisma.PatientInclude;
