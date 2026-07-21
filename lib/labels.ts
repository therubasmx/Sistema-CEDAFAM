// Spanish display labels for enum values, used across the UI.
import {
  Role,
  Position,
  EventKind,
  Speciality,
  WorkType,
  ServiceArea,
  ReferenceType,
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

export const roleLabels: Record<Role, string> = {
  ADMIN: "Jefe Principal",
  COORDINATOR: "Coordinación",
  ACCOUNTANT: "Contadora",
  PSYCHOLOGIST: "Psicólogo/a",
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
  FELLOW: "Becario",
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
 * Máximo de solicitudes/citas activas (PENDING o SCHEDULED) que pueden
 * solaparse en el mismo horario en toda la clínica, sin importar el
 * psicólogo: no puede haber más citas simultáneas que consultorios físicos.
 */
export const MAX_CONCURRENT_APPOINTMENTS = ROOM_ORDER.length;

/**
 * Etiquetas legibles de los horarios fijos de atención (mismos que declara el
 * psicólogo en su disponibilidad). La clave es el `startTime` "HH:mm".
 */
export const SLOT_LABELS: Record<string, string> = {
  "09:00": "9:00 am",
  "10:00": "10:00 am",
  "11:00": "11:00 am",
  "12:00": "12:00 pm",
  "14:30": "2:30 pm",
  "15:30": "3:30 pm",
  "16:30": "4:30 pm",
  "17:30": "5:30 pm",
};

export const roomBookingStatusLabels: Record<RoomBookingStatus, string> = {
  PENDING: "Pendiente de autorización",
  APPROVED: "Consultorio autorizado",
  REJECTED: "Consultorio rechazado",
};

export const discountLevelLabels: Record<DiscountLevel, string> = {
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
};

/** Maps a serviceArea (from the form) to the speciality used for matching. */
export const serviceAreaToSpeciality: Record<ServiceArea, Speciality[]> = {
  PSYCHOLOGY: [Speciality.CLINICAL, Speciality.FAMILY_THERAPY, Speciality.EDUCATIONAL],
  PSYCHIATRY: [Speciality.PSYCHIATRY],
  PSYCHOLOGICAL_EVALUATION: [Speciality.NEUROPSYCHOLOGY, Speciality.CLINICAL],
  NEUROPSYCHOLOGICAL: [Speciality.NEUROPSYCHOLOGY],
};
