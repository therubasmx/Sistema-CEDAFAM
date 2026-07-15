// Spanish display labels for enum values, used across the UI.
import {
  Role,
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
} from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Jefe Principal",
  COORDINATOR: "Coordinación",
  ACCOUNTANT: "Contadora",
  PSYCHOLOGIST: "Psicólogo/a",
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
  SCHEDULED: "Agendada",
  ATTENDED: "Asistió",
  NO_SHOW: "No asistió",
  CANCELLED: "Cancelada",
};

export const roomLabels: Record<Room, string> = {
  GESELL: "Cámara Gesell",
  LUDOTECA: "Ludoteca",
  OFFICE_ANTONIO: "Oficina de Antonio",
  CONSULTORIO_1: "Consultorio 1",
  CONSULTORIO_2: "Consultorio 2",
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
  APPOINTMENT_REMINDER: "Cita próxima",
  EVENT_REMINDER: "Evento próximo",
  ANNOUNCEMENT: "Aviso",
};

/** Maps a serviceArea (from the form) to the speciality used for matching. */
export const serviceAreaToSpeciality: Record<ServiceArea, Speciality[]> = {
  PSYCHOLOGY: [Speciality.CLINICAL, Speciality.FAMILY_THERAPY, Speciality.EDUCATIONAL],
  PSYCHIATRY: [Speciality.PSYCHIATRY],
  PSYCHOLOGICAL_EVALUATION: [Speciality.NEUROPSYCHOLOGY, Speciality.CLINICAL],
  NEUROPSYCHOLOGICAL: [Speciality.NEUROPSYCHOLOGY],
};
