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
} from "@prisma/client";

export const patientCreateSchema = z.object({
  fullName: z.string().trim().min(3, "El nombre es obligatorio"),
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

export const statusUpdateSchema = z
  .object({
    serviceType: z.nativeEnum(ServiceType),
    therapyStatus: z.nativeEnum(TherapyStatus).optional().nullable(),
    evaluationStatus: z.nativeEnum(EvaluationStatus).optional().nullable(),
    notes: z.string().trim().optional().nullable(),
  })
  .refine(
    (d) =>
      d.serviceType === ServiceType.THERAPY ? !!d.therapyStatus : !!d.evaluationStatus,
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
  })
  .refine(
    (d) =>
      d.serviceType === ServiceType.THERAPY ? !!d.therapyStatus : !!d.evaluationStatus,
    { message: "Estado incompatible con el tipo de servicio" },
  );

export const availabilityBlockSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  slot: z.nativeEnum(TimeSlot),
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
  notes: z.string().trim().optional().nullable(),
});

export const appointmentUpdateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  duration: z.coerce.number().int().min(15).max(480).optional(),
  serviceType: z.nativeEnum(AppointmentServiceType).optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  notes: z.string().trim().optional().nullable(),
});

export const weeklyReportSchema = z.object({
  hoursOfAttention: z.coerce.number().int().min(0).max(168),
  activePatientCount: z.coerce.number().int().min(0).max(500),
  notes: z.string().trim().optional().nullable(),
  patientUpdates: z.array(reportPatientUpdateSchema).default([]),
  availability: z.array(availabilityBlockSchema).default([]),
});
export type WeeklyReportInput = z.infer<typeof weeklyReportSchema>;
