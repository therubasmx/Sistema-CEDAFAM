import { z } from "zod";
import {
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
  Role,
  Speciality,
  WorkType,
  DiscountLevel,
  PatientType,
} from "@prisma/client";

export const patientCreateSchema = z.object({
  fullName: z.string().trim().min(3, "El nombre es obligatorio"),
  fileNumber: z.string().trim().optional().or(z.literal("")).nullable(),
  cedafamFolio: z.string().trim().optional().or(z.literal("")).nullable(),
  age: z.coerce.number().int().min(0).max(120),
  dateOfBirth: z.coerce.date().optional().nullable(),
  curp: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{18}$/i, "CURP inválida (18 caracteres)")
    .optional()
    .or(z.literal(""))
    .nullable(),
  phoneNumber: z.string().trim().min(10, "Teléfono inválido"),
  address: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")).nullable(),
  serviceArea: z.nativeEnum(ServiceArea),
  referenceType: z.nativeEnum(ReferenceType).default(ReferenceType.NONE),
  consultationReason: z.string().trim().min(3, "El motivo es obligatorio"),
  preferredTimeSlot: z.nativeEnum(TimeSlot),
});
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

// Partial update — all fields optional.
export const patientUpdateSchema = patientCreateSchema.partial();

// Public intake form (/form): every field the patient sees is mandatory.
// fileNumber/cedafamFolio aren't part of this form (captured later by staff), so they're left as-is.
export const publicPatientCreateSchema = patientCreateSchema.extend({
  dateOfBirth: z.coerce.date({
    required_error: "La fecha de nacimiento es obligatoria",
    invalid_type_error: "Fecha de nacimiento inválida",
  }),
  curp: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{18}$/i, "CURP inválida (18 caracteres)"),
  address: z.string().trim().min(1, "La dirección es obligatoria"),
  postalCode: z.string().trim().min(1, "El código postal es obligatorio"),
  email: z.string().trim().email("Email inválido"),
});

export const statusUpdateSchema = z
  .object({
    serviceType: z.nativeEnum(ServiceType),
    therapyStatus: z.nativeEnum(TherapyStatus).optional().nullable(),
    evaluationStatus: z.nativeEnum(EvaluationStatus).optional().nullable(),
    notes: z.string().trim().optional().nullable(),
  })
  .refine(
    (d) =>
      d.serviceType === ServiceType.EVALUATION ? !!d.evaluationStatus : !!d.therapyStatus,
    { message: "Debe indicar el estado correspondiente al tipo de servicio" },
  );

export const assignmentCreateSchema = z.object({
  patientId: z.string().uuid(),
  psychologistId: z.string().uuid(),
  isExploratorySession: z.boolean().default(false),
});

const reportPatientUpdateSchema = z
  .object({
    patientId: z.string().uuid(),
    serviceType: z.nativeEnum(ServiceType),
    therapyStatus: z.nativeEnum(TherapyStatus).optional().nullable(),
    evaluationStatus: z.nativeEnum(EvaluationStatus).optional().nullable(),
    patientType: z.nativeEnum(PatientType).optional().nullable(),
  })
  .refine(
    (d) => {
      const hasStatus =
        d.serviceType === ServiceType.EVALUATION
          ? !!d.evaluationStatus
          : !!d.therapyStatus;
      // Una fila es válida si actualiza el estado o el tipo de paciente.
      return hasStatus || !!d.patientType;
    },
    { message: "Indica un estado o un tipo de paciente" },
  );

const VALID_START_TIMES = [
  "09:00", "10:00", "11:00", "12:00",
  "14:30", "15:30", "16:30", "17:30",
] as const;

export const availabilityBlockSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  startTime: z.enum(VALID_START_TIMES),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const availabilityUpdateSchema = z.object({
  blocks: z.array(availabilityBlockSchema),
});

export const appointmentCreateSchema = z.object({
  patientId: z.string().uuid(),
  psychologistId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  duration: z.coerce.number().int().min(15).max(480),
  serviceType: z.nativeEnum(AppointmentServiceType),
  room: z.nativeEnum(Room).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const appointmentUpdateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  duration: z.coerce.number().int().min(15).max(480).optional(),
  serviceType: z.nativeEnum(AppointmentServiceType).optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  room: z.nativeEnum(Room).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  // El psicólogo reenvía una solicitud (p. ej. tras un rechazo) con nueva
  // fecha/hora. Vuelve a dejar la cita en PENDING para revisión de la Contadora.
  resend: z.boolean().optional(),
});

/** Coordinación autoriza o rechaza el consultorio de una cita. */
export const roomAuthorizationSchema = z.object({
  decision: z.enum([RoomBookingStatus.APPROVED, RoomBookingStatus.REJECTED]),
});

/**
 * La Contadora asigna, mueve o libera el consultorio de una cita agendada desde
 * el tablero de Consultorios. `room` en `null` devuelve la cita al grupo de
 * pacientes sin consultorio.
 */
export const appointmentRoomAssignSchema = z.object({
  room: z.nativeEnum(Room).nullable(),
});

/** La Contadora acepta o rechaza una solicitud de cita. Rechazar exige motivo. */
export const appointmentReviewSchema = z
  .object({
    decision: z.enum(["ACCEPT", "REJECT"]),
    note: z.string().trim().optional().nullable(),
  })
  .refine((d) => d.decision !== "REJECT" || !!d.note, {
    message: "Debes indicar el motivo del rechazo",
    path: ["note"],
  });

export const calendarEventCreateSchema = z
  .object({
    title: z.string().trim().min(2, "El nombre del evento es obligatorio"),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
  })
  .refine((d) => d.endAt > d.startAt, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endAt"],
  });
export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateSchema>;

export const weeklyReportSchema = z.object({
  hoursOfAttention: z.coerce.number().int().min(0).max(168),
  activePatientCount: z.coerce.number().int().min(0).max(500),
  notes: z.string().trim().optional().nullable(),
  patientUpdates: z.array(reportPatientUpdateSchema).default([]),
  availability: z.array(availabilityBlockSchema).default([]),
});
export type WeeklyReportInput = z.infer<typeof weeklyReportSchema>;

export const userCreateSchema = z
  .object({
    email: z.string().trim().email().toLowerCase(),
    name: z.string().trim().min(3),
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Za-z]/, "Debe incluir al menos una letra")
      .regex(/[0-9]/, "Debe incluir al menos un número"),
    role: z.nativeEnum(Role),
    coordination: z.string().trim().max(120).optional().nullable(),
    speciality: z.nativeEnum(Speciality).optional(),
    workType: z.nativeEnum(WorkType).optional(),
  })
  .refine(
    (d) => {
      const needsProfile = d.role === Role.PSYCHOLOGIST;
      return !needsProfile || (!!d.speciality && !!d.workType);
    },
    { message: "Los psicólogos requieren especialidad y tipo de trabajo" },
  );

export const userUpdateSchema = z.object({
  name: z.string().trim().min(3).optional(),
  role: z.nativeEnum(Role).optional(),
  coordination: z.string().trim().max(120).optional().nullable(),
  isActive: z.boolean().optional(),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Za-z]/, "Debe incluir al menos una letra")
    .regex(/[0-9]/, "Debe incluir al menos un número")
    .optional(),
  speciality: z.nativeEnum(Speciality).optional(),
  workType: z.nativeEnum(WorkType).optional(),
});

export const siereCreateSchema = z.object({
  patientId: z.string().uuid(),
  discountLevel: z.nativeEnum(DiscountLevel),
});
