import { subYears } from "date-fns";
import { AppointmentStatus, type Prisma } from "@prisma/client";

export const EXPEDIENTE_VIGENTE_YEARS = 5;

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
