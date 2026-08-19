// Spanish display labels for enum values, used across the UI.
import {
  Role,
  Position,
  EventKind,
  Speciality,
  WorkType,
  ServiceArea,
  ReferenceType,
  ConsultationCategory,
  TimeSlot,
  ServiceType,
  TherapyStatus,
  EvaluationStatus,
  AppointmentServiceType,
  AppointmentStatus,
  Room,
  RoomBookingStatus,
  DiscountLevel,
  NotificationType,
  PatientType,
  LeaveStatus,
  LeaveProgram,
  LeaveUnit,
} from "@prisma/client";
import type { AgeRangeKey } from "@/lib/validators";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Jefe Principal",
  COORDINATOR: "Coordinación",
  ACCOUNTANT: "Recepción",
  PSYCHOLOGIST: "Psicólogo/a",
  VOLUNTEER: "Voluntario/a",
};

/** Nombre completo del puesto, como se usa en formularios y encabezados. */
export const positionLabels: Record<Position, string> = {
  PRIVATE_CARE_SERVICES: "Coordinación Servicios de Atención Privada",
  INNOVATION_RESEARCH: "Coordinación Innovación e Investigación",
  PROFESSIONAL_DEVELOPMENT: "Coordinación Desarrollo Profesional",
  COMMUNITY_OUTREACH: "Coordinación Extensión a la Comunidad",
  HUMAN_CAPITAL: "Coordinación Capital Humano",
  BIRTHDAYS: "Cumpleaños",
};

/**
 * Versión corta para la barra lateral, donde el nombre completo no cabe.
 */
export const positionShortLabels: Record<Position, string> = {
  PRIVATE_CARE_SERVICES: "Atención Privada",
  INNOVATION_RESEARCH: "Innovación",
  PROFESSIONAL_DEVELOPMENT: "Desarrollo Profesional",
  COMMUNITY_OUTREACH: "Extensión a la Comunidad",
  HUMAN_CAPITAL: "Capital Humano",
  BIRTHDAYS: "Cumpleaños",
};

/** Qué hace cada módulo. Se muestra en el hub de coordinaciones. */
export const positionDescriptions: Record<Position, string> = {
  PRIVATE_CARE_SERVICES:
    "Resúmenes e historial de lo que hace cada coordinación.",
  INNOVATION_RESEARCH:
    "Respuestas de la encuesta de satisfacción, en gráficas y exportables.",
  PROFESSIONAL_DEVELOPMENT:
    "Solicitudes de permiso de los psicólogos: aceptar, rechazar e historial.",
  COMMUNITY_OUTREACH:
    "Eventos con la comunidad, con los psicólogos que se inviten a cada uno.",
  HUMAN_CAPITAL: "Eventos internos dirigidos a todo el equipo.",
  BIRTHDAYS: "Festejos y fechas de cumpleaños del equipo.",
};

/** Segmento de URL de cada módulo: /dashboard/coordinacion/<slug>. */
export const positionSlugs: Record<Position, string> = {
  PRIVATE_CARE_SERVICES: "atencion-privada",
  INNOVATION_RESEARCH: "innovacion",
  PROFESSIONAL_DEVELOPMENT: "desarrollo-profesional",
  COMMUNITY_OUTREACH: "extension-comunidad",
  HUMAN_CAPITAL: "capital-humano",
  BIRTHDAYS: "cumpleanos",
};

/** Orden en que se listan los puestos en el hub y en los selectores. */
export const POSITION_ORDER: Position[] = [
  Position.PRIVATE_CARE_SERVICES,
  Position.INNOVATION_RESEARCH,
  Position.PROFESSIONAL_DEVELOPMENT,
  Position.COMMUNITY_OUTREACH,
  Position.HUMAN_CAPITAL,
  Position.BIRTHDAYS,
];

/** Resuelve el slug de una URL al puesto correspondiente, o `null`. */
export function positionFromSlug(slug: string): Position | null {
  return (
    POSITION_ORDER.find((p) => positionSlugs[p] === slug) ?? null
  );
}

export const leaveStatusLabels: Record<LeaveStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aceptada",
  REJECTED: "Rechazada",
};

export const leaveProgramLabels: Record<LeaveProgram, string> = {
  POSTGRADUATE: "Posgrado",
  SOCIAL_SERVICE: "Servicio Social",
  INTERNSHIP: "Practicante",
  VOLUNTEER: "Voluntariado",
};

export const leaveUnitLabels: Record<LeaveUnit, string> = {
  HOURS: "Horas",
  DAYS: "Días",
};

export const eventKindLabels: Record<EventKind, string> = {
  GENERAL: "Evento interno",
  COMMUNITY: "Extensión a la Comunidad",
  HUMAN_CAPITAL: "Capital Humano",
  BIRTHDAY_PARTY: "Festejo de cumpleaños",
  LEAVE: "Permiso",
  CASE_STUDY: "Estudio de caso",
  DEVELOPMENT_MEETING: "Reunión",
};

export const ageRangeLabels: Record<AgeRangeKey, string> = {
  "6-11": "6–11 años",
  "12-17": "12–17 años",
  "18-29": "18–29 años",
  "30-44": "30–44 años",
  "45-59": "45–59 años",
  "60+": "60 años y más",
};

export const specialityLabels: Record<Speciality, string> = {
  CLINICAL: "Psicología Clínica",
  EDUCATIONAL: "Psicología Educativa",
  FAMILY_THERAPY: "Terapia Familiar",
  NEUROPSYCHOLOGY: "Neuropsicología",
  PSYCHIATRY: "Psiquiatría",
};

export const workTypeLabels: Record<WorkType, string> = {
  FULL_TIME: "Tiempo completo",
  PART_TIME: "Medio tiempo",
  INTERN: "Pasante",
  STUDENT: "Estudiante",
};

export const serviceAreaLabels: Record<ServiceArea, string> = {
  PSYCHOLOGY: "Psicología",
  PSYCHIATRY: "Psiquiatría",
  PSYCHOLOGICAL_EVALUATION: "Evaluación Psicológica",
  NEUROPSYCHOLOGICAL: "Neuropsicológica",
};

export const referenceTypeLabels: Record<ReferenceType, string> = {
  UM_STUDENT: "Estudiante UM",
  COAE: "COAE",
  UM_EMPLOYEE: "Empleado UM",
  HOSPITAL_EMPLOYEE: "Empleado Hospital",
  DUPS: "DUPS",
  NONE: "Ninguna / Particular",
};

export const consultationCategoryLabels: Record<ConsultationCategory, string> = {
  EMOTIONAL_DISTRESS: "Malestar emocional",
  COUPLES_THERAPY: "Terapia de pareja",
  FAMILY_PROBLEMS: "Problemas familiares",
  ACADEMIC_PROBLEMS: "Problemas académicos",
  NEUROPSYCHOLOGICAL_EVALUATION: "Evaluación neuropsicológica",
  PSYCHOLOGICAL_EVALUATION: "Evaluación psicológica",
  PSYCHIATRY: "Psiquiatría",
};

/** Orden en que se listan las categorías en el desplegable. */
export const consultationCategoryOrder: ConsultationCategory[] = [
  ConsultationCategory.EMOTIONAL_DISTRESS,
  ConsultationCategory.COUPLES_THERAPY,
  ConsultationCategory.FAMILY_PROBLEMS,
  ConsultationCategory.ACADEMIC_PROBLEMS,
  ConsultationCategory.NEUROPSYCHOLOGICAL_EVALUATION,
  ConsultationCategory.PSYCHOLOGICAL_EVALUATION,
  ConsultationCategory.PSYCHIATRY,
];

export const timeSlotLabels: Record<TimeSlot, string> = {
  MORNING: "Matutino (9:00 - 11:00)",
  AFTERNOON: "Vespertino (14:30 - 17:30)",
};

export const serviceTypeLabels: Record<ServiceType, string> = {
  THERAPY: "Terapia",
  EVALUATION: "Evaluación",
  PSYCHIATRY: "Psiquiatría",
};

export const patientTypeLabels: Record<PatientType, string> = {
  PARTICULAR: "Particular",
  UM_EMPLOYEE: "Empleado UM",
  HLC_EMPLOYEE: "Empleado HLC",
  UM_STUDENT: "Alumno UM",
  SIERE: "SIERE",
};

export const therapyStatusLabels: Record<TherapyStatus, string> = {
  ACTIVE: "Activo",
  THERAPEUTIC_DISCHARGE: "Alta terapéutica",
  VOLUNTARY_DISCHARGE: "Alta voluntaria",
  NEVER_CAME: "Nunca vino",
  REFERRED: "Referido",
  CANCELLED: "Cancelado",
};

export const evaluationStatusLabels: Record<EvaluationStatus, string> = {
  WAITLIST: "Lista de espera",
  TEST_APPLICATION: "Aplicación de pruebas",
  REPORT_PREPARATION: "Elaboración de informe",
  EVALUATION_COMPLETED: "Evaluación finalizada",
  REFERRAL: "Canalización",
  CANCELLED: "Cancelado",
};

export const appointmentServiceTypeLabels: Record<AppointmentServiceType, string> = {
  THERAPY: "Terapia",
  EXPLORATION_SESSION: "Sesión de exploración",
  EVALUATION: "Evaluación",
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  SCHEDULED: "Agendada",
  ATTENDED: "Asistió",
  NO_SHOW: "No asistió",
  CANCELLED: "Cancelada",
  REJECTED: "Rechazada",
  RESCHEDULED: "Reagendó",
};

export const roomLabels: Record<Room, string> = {
  GESELL: "Cámara Gesell",
  LUDOTECA: "Ludoteca",
  OFFICE_ANTONIO: "Oficina de Antonio",
  CONSULTORIO_1: "Consultorio 1 (Neuropsicología)",
  CONSULTORIO_2: "Consultorio 2",
  CONSULTORIO_EVALUACION: "Consultorio de Evaluación",
  CONSULTORIO_3: "Consultorio 3",
};

/**
 * Orden en que se muestran los consultorios en el tablero (columna derecha).
 * Sigue la numeración física del centro, no el orden del enum.
 */
export const ROOM_ORDER: Room[] = [
  Room.GESELL,
  Room.OFFICE_ANTONIO,
  Room.CONSULTORIO_EVALUACION,
  Room.LUDOTECA,
  Room.CONSULTORIO_1,
  Room.CONSULTORIO_2,
  Room.CONSULTORIO_3,
];

/** Máximo de pacientes que un consultorio puede recibir en un mismo día. */
export const ROOM_DAILY_CAPACITY = 7;

/**
 * El Consultorio 2 se usa para otra actividad los jueves por la tarde, salvo
 * para la psiquiatra: en ese horario solo puede agendarse ahí un psicólogo
 * con especialidad Psiquiatría. `dayOfWeek` sigue la convención de
 * mxDayAndTime (1 = lunes … 7 = domingo); `startTime` es un valor de
 * HOUR_SLOTS como "14:30".
 */
export function isRoomBlockedAt(
  room: Room,
  dayOfWeek: number,
  startTime: string,
  psychologistSpeciality?: Speciality | null,
): boolean {
  if (room !== Room.CONSULTORIO_2) return false;
  if (dayOfWeek !== 4 || startTime < "14:30") return false;
  return psychologistSpeciality !== Speciality.PSYCHIATRY;
}

/**
 * Máximo de solicitudes/citas activas (PENDING o SCHEDULED) que pueden
 * solaparse en el mismo horario en toda la clínica, sin importar el
 * psicólogo: no puede haber más citas simultáneas que consultorios físicos.
 */
export const MAX_CONCURRENT_APPOINTMENTS = ROOM_ORDER.length;

export interface HourSlot {
  startTime: string;
  endTime: string;
  label: string;
}

/**
 * Rejilla fija de bloques de una hora en la que se atiende: mañana 9–12,
 * mediodía, tarde 2:30–5:30. Es la misma rejilla que el psicólogo llena en su
 * reporte semanal (disponibilidad), la que se ofrece al agendar una cita y la
 * que usan los reportes para mapear una cita a un bloque. Fuente única para
 * que no se desfasen entre sí.
 */
export const HOUR_SLOTS: HourSlot[] = [
  { startTime: "09:00", endTime: "10:00", label: "9:00 am" },
  { startTime: "10:00", endTime: "11:00", label: "10:00 am" },
  { startTime: "11:00", endTime: "12:00", label: "11:00 am" },
  { startTime: "12:00", endTime: "13:00", label: "12:00 pm" },
  { startTime: "14:30", endTime: "15:30", label: "2:30 pm" },
  { startTime: "15:30", endTime: "16:30", label: "3:30 pm" },
  { startTime: "16:30", endTime: "17:30", label: "4:30 pm" },
  { startTime: "17:30", endTime: "18:30", label: "5:30 pm" },
];

/**
 * ¿La clínica ofrece este bloque ese día? Los viernes se atiende solo por la
 * mañana: nadie da consulta de 2:30 pm en adelante, así que esos bloques no se
 * ofrecen a nadie, ni para declararlos en el reporte ni para agendar sobre
 * ellos. El resto de la rejilla —el bloque de mediodía incluido— se ofrece
 * todos los días y es cada psicólogo quien declara cuáles toma.
 *
 * Fuente única de la regla: la usan el reporte semanal (qué se puede marcar),
 * el selector de horarios al agendar y la validación del servidor.
 */
export function isOfferedSlot(dayOfWeek: number, startTime: string): boolean {
  if (dayOfWeek === 5) return startTime < "14:30";
  return true;
}

/**
 * Etiquetas legibles de los horarios fijos de atención (mismos que declara el
 * psicólogo en su disponibilidad). La clave es el `startTime` "HH:mm".
 */
export const SLOT_LABELS: Record<string, string> = Object.fromEntries(
  HOUR_SLOTS.map((s) => [s.startTime, s.label]),
);

export const roomBookingStatusLabels: Record<RoomBookingStatus, string> = {
  PENDING: "Pendiente de autorización",
  APPROVED: "Consultorio autorizado",
  REJECTED: "Consultorio rechazado",
};

export const discountLevelLabels: Record<DiscountLevel, string> = {
  LEVEL_0: "Nivel 0 — Gratuito",
  LEVEL_1: "Nivel 1 — $100",
  LEVEL_2: "Nivel 2 — $280",
  LEVEL_3: "Nivel 3 — $370",
  LEVEL_4: "Nivel 4 — $490",
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  NEW_FORM_SUBMITTED: "Nuevo formulario",
  PATIENT_ASSIGNED: "Paciente asignado",
  WEEKLY_REPORT_DUE: "Reporte semanal pendiente",
  URGENT: "Urgente",
  ROOM_AUTH_REQUEST: "Autorización de consultorio",
  ROOM_AUTH_RESULT: "Resultado de autorización",
  APPOINTMENT_REQUEST: "Nueva solicitud de cita",
  APPOINTMENT_REQUEST_RESULT: "Resultado de solicitud",
  APPOINTMENT_REMINDER: "Cita próxima",
  EVENT_REMINDER: "Evento próximo",
  ANNOUNCEMENT: "Aviso",
  LEAVE_REQUEST: "Solicitud de permiso",
  LEAVE_REQUEST_RESULT: "Resultado del permiso",
  EVENT_INVITATION: "Invitación a evento",
  PATIENT_MATCH_REVIEW: "Posible expediente existente",
};

/** Maps a serviceArea (from the form) to the speciality used for matching. */
export const serviceAreaToSpeciality: Record<ServiceArea, Speciality[]> = {
  PSYCHOLOGY: [Speciality.CLINICAL, Speciality.FAMILY_THERAPY, Speciality.EDUCATIONAL],
  PSYCHIATRY: [Speciality.PSYCHIATRY],
  PSYCHOLOGICAL_EVALUATION: [Speciality.NEUROPSYCHOLOGY, Speciality.CLINICAL],
  NEUROPSYCHOLOGICAL: [Speciality.NEUROPSYCHOLOGY],
};
