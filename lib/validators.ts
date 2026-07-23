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
  Position,
  Speciality,
  WorkType,
  DiscountLevel,
  PatientType,
  LeaveProgram,
  LeaveUnit,
  EventKind,
  EventScope,
} from "@prisma/client";
import { mxSlotStart } from "@/lib/utils";

/**
 * "yyyy-MM-dd" (sin hora, como el que entrega `CalendarDayPicker`) a las 00:00
 * hora de Ciudad de México. `z.coerce.date()` lo interpretaría como medianoche
 * UTC, seis horas antes de lo que el día realmente significa; los helpers de
 * `lib/utils` (`formatMxDateInput`, `startOfMxDay`) restan esas seis horas de
 * nuevo al leerlo, así que el día terminaba corriéndose uno hacia atrás.
 */
const mxDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .transform((s) => mxSlotStart(s, "00:00"));

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

// Decisión de Coordinación sobre un PatientIntakeMatch: aplicar los datos
// entrantes al expediente encontrado, o reconocer que es otra persona.
export const intakeMatchDecisionSchema = z.object({
  decision: z.enum(["APPLY", "CREATE_NEW"]),
});

// Decisión de Coordinación sobre un PatientDuplicateCandidate: fusionar los
// dos expedientes (indicando cuál se conserva) o reconocer que son personas
// distintas.
export const duplicateCandidateDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("NOT_DUPLICATE") }),
  z.object({ decision: z.literal("MERGE"), keepPatientId: z.string().min(1) }),
]);

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
export type PublicPatientCreateInput = z.infer<typeof publicPatientCreateSchema>;

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

// Corrige una entrada puntual del historial de asignaciones (psicólogo
// equivocado); no crea una fila nueva ni toca assignedAt/assignedById.
export const assignmentUpdateSchema = z.object({
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
      // Cada fila del reporte semanal es obligatoria: estado y tipo de paciente.
      return hasStatus && !!d.patientType;
    },
    { message: "Indica un estado y un tipo de paciente" },
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
  // Segundo psicólogo en coterapia (opcional): la cita también aparece en su
  // calendario y se valida que no choque con su propia agenda.
  coTherapistId: z.string().uuid().optional().nullable(),
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
  coTherapistId: z.string().uuid().optional().nullable(),
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

/**
 * La Contadora resuelve una solicitud de cita:
 *   - ACCEPT: aprueba con la fecha/hora propuesta.
 *   - REJECT: rechaza (exige motivo).
 *   - SCHEDULE: agenda directamente eligiendo una fecha/hora confirmada dentro
 *     de la disponibilidad del psicólogo (exige `scheduledAt`).
 */
export const appointmentReviewSchema = z
  .object({
    decision: z.enum(["ACCEPT", "REJECT", "SCHEDULE"]),
    note: z.string().trim().optional().nullable(),
    scheduledAt: z.coerce.date().optional(),
    duration: z.coerce.number().int().min(15).max(480).optional(),
    serviceType: z.nativeEnum(AppointmentServiceType).optional(),
    room: z.nativeEnum(Room).optional().nullable(),
    notes: z.string().trim().optional().nullable(),
  })
  .refine((d) => d.decision !== "REJECT" || !!d.note, {
    message: "Debes indicar el motivo del rechazo",
    path: ["note"],
  })
  .refine((d) => d.decision !== "SCHEDULE" || !!d.scheduledAt, {
    message: "Selecciona un horario para agendar",
    path: ["scheduledAt"],
  });

export const calendarEventCreateSchema = z
  .object({
    title: z.string().trim().min(2, "El nombre del evento es obligatorio"),
    description: z.string().trim().max(1000).optional().or(z.literal("")).nullable(),
    location: z.string().trim().max(200).optional().or(z.literal("")).nullable(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    kind: z.nativeEnum(EventKind).default(EventKind.GENERAL),
    scope: z.nativeEnum(EventScope).default(EventScope.ALL),
    // Con scope = SELECTED son los invitados. Con kind = CASE_STUDY, alcance
    // ALL igual: es el psicólogo que presenta el caso (ver abajo).
    attendeeIds: z.array(z.string().uuid()).default([]),
  })
  .refine((d) => d.endAt > d.startAt, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endAt"],
  })
  .refine(
    (d) => d.scope !== EventScope.SELECTED || d.attendeeIds.length > 0,
    { message: "Selecciona al menos un psicólogo", path: ["attendeeIds"] },
  )
  .refine(
    (d) => d.kind !== EventKind.CASE_STUDY || d.attendeeIds.length === 1,
    {
      message: "Selecciona al psicólogo que presentará el caso",
      path: ["attendeeIds"],
    },
  );
export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateSchema>;

export const weeklyReportSchema = z.object({
  hoursOfAttention: z.coerce.number().int().min(0).max(168),
  activePatientCount: z.coerce.number().int().min(0).max(500),
  notes: z.string().trim().optional().nullable(),
  patientUpdates: z.array(reportPatientUpdateSchema).default([]),
  availability: z
    .array(availabilityBlockSchema)
    .min(1, "Marca al menos un horario disponible"),
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
    position: z.nativeEnum(Position).nullable().optional(),
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
  position: z.nativeEnum(Position).nullable().optional(),
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

/**
 * Solicitud de permiso. El nombre y la fecha de solicitud no se capturan:
 * salen de la sesión y del `requestedAt` por defecto.
 */
export const leaveRequestCreateSchema = z
  .object({
    area: z.nativeEnum(Speciality),
    program: z.nativeEnum(LeaveProgram),
    unit: z.nativeEnum(LeaveUnit),
    quantity: z.coerce.number().int().min(1).max(90),
    startDate: mxDateOnly,
    endDate: mxDateOnly,
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Hora inválida")
      .optional()
      .or(z.literal(""))
      .nullable(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Hora inválida")
      .optional()
      .or(z.literal(""))
      .nullable(),
    reason: z.string().trim().min(5, "Describe el motivo del permiso"),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "La fecha final no puede ser anterior a la inicial",
    path: ["endDate"],
  })
  .refine((d) => d.unit !== LeaveUnit.HOURS || (!!d.startTime && !!d.endTime), {
    message: "Indica el horario del permiso",
    path: ["startTime"],
  })
  .refine(
    (d) =>
      d.unit !== LeaveUnit.HOURS ||
      !d.startTime ||
      !d.endTime ||
      d.endTime > d.startTime,
    { message: "La hora de fin debe ser posterior a la de inicio", path: ["endTime"] },
  );

/** Coordinación Desarrollo Profesional acepta o rechaza un permiso. */
export const leaveReviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().trim().optional().nullable(),
  })
  .refine((d) => d.decision !== "REJECT" || !!d.note, {
    message: "Debes indicar el motivo del rechazo",
    path: ["note"],
  });

/**
 * Folio de evaluación. Ni el número de folio ni el evaluador se capturan: el
 * primero lo asigna el servidor como consecutivo y el segundo sale de la
 * sesión de quien lo genera.
 */
export const evaluationFolioCreateSchema = z
  .object({
    patientId: z.string().uuid(),
    diagnosis: z.string().trim().min(3, "Escribe el diagnóstico"),
    firstInterviewAt: z.coerce.date({
      required_error: "Indica la fecha de la primera entrevista",
      invalid_type_error: "Fecha inválida",
    }),
    resultsDeliveryAt: z.coerce.date({
      required_error: "Indica la fecha de entrega de resultados",
      invalid_type_error: "Fecha inválida",
    }),
  })
  .refine((d) => d.resultsDeliveryAt >= d.firstInterviewAt, {
    message: "La entrega de resultados no puede ser anterior a la primera entrevista",
    path: ["resultsDeliveryAt"],
  });

/**
 * Corrección de un folio ya emitido. El número de folio nunca se toca: es lo
 * que identifica el registro.
 *
 * Los campos de texto (nombre, expediente, evaluador, fecha literal) solo
 * aplican a los folios históricos, que es donde falta información por
 * completar; en un folio nuevo esos datos salen del paciente y del usuario
 * ligados y la ruta los rechaza.
 */
export const evaluationFolioUpdateSchema = z
  .object({
    diagnosis: z.string().trim().min(3, "Escribe el diagnóstico").optional(),
    firstInterviewAt: z.coerce.date().optional().nullable(),
    resultsDeliveryAt: z.coerce.date().optional().nullable(),
    patientName: z.string().trim().min(3, "Escribe el nombre del paciente").optional(),
    fileNumber: z.string().trim().optional().or(z.literal("")).nullable(),
    evaluatorName: z.string().trim().min(3, "Escribe el nombre del evaluador").optional(),
    evaluationDateText: z.string().trim().max(200).optional().or(z.literal("")).nullable(),
    reportLink: z
      .string()
      .trim()
      .url("El link debe ser una dirección válida (https://…)")
      .optional()
      .or(z.literal(""))
      .nullable(),
  })
  .refine(
    (d) =>
      !d.firstInterviewAt ||
      !d.resultsDeliveryAt ||
      d.resultsDeliveryAt >= d.firstInterviewAt,
    {
      message: "La entrega de resultados no puede ser anterior a la primera entrevista",
      path: ["resultsDeliveryAt"],
    },
  );

export const siereCreateSchema = z.object({
  patientId: z.string().uuid(),
  discountLevel: z.nativeEnum(DiscountLevel),
});
