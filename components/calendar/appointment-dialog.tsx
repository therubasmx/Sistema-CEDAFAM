"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Search, AlertTriangle, Repeat } from "lucide-react";
import {
  AppointmentServiceType,
  AppointmentStatus,
  ReferenceType,
  Role,
  Room,
  RoomBookingStatus,
  ServiceArea,
  Speciality,
} from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { CalendarDayPicker } from "@/components/ui/calendar-day-picker";
import { can } from "@/lib/permissions";
import {
  appointmentServiceTypeLabels,
  appointmentStatusLabels,
  isRoomBlockedAt,
  referenceTypeLabels,
  roomLabels,
  ROOM_ORDER,
  serviceAreaLabels,
  HOUR_SLOTS,
  MAX_CONCURRENT_APPOINTMENTS,
  type HourSlot,
} from "@/lib/labels";
import {
  cn,
  formatMxDateInput,
  formatMxTime,
  mxDayAndTime,
  mxSlotToISO,
} from "@/lib/utils";

export interface CalendarAppointment {
  id: string;
  patientId: string;
  scheduledAt: string;
  duration: number;
  serviceType: AppointmentServiceType;
  status: AppointmentStatus;
  room: Room | null;
  roomStatus: RoomBookingStatus | null;
  rejectionReason: string | null;
  notes: string | null;
  /** true si es la primera cita "viva" del paciente en CEDAFAM; false si ya tuvo otra antes (seguimiento). */
  isFirstVisit: boolean;
  patient: { id: string; fullName: string };
  psychologist: { id: string; user: { name: string } };
  coTherapist: { id: string; user: { name: string } } | null;
}

/** Valor centinela para "sin preferencia" de consultorio (Radix Select no admite ""). */
const NO_ROOM = "NONE";

/**
 * Consultorios que un psicólogo puede pedir como preferencia al crear una
 * cita; "Sin preferencia" deja toda la asignación en manos de la Recepción.
 * Mismo orden físico que el tablero de Consultorios (ROOM_ORDER).
 */
const PREFERENCE_ROOMS: Room[] = ROOM_ORDER;

/** Estados editables a mano en una cita ya confirmada (asistencia). */
const EDITABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.ATTENDED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.RESCHEDULED,
];

const statusVariant: Record<AppointmentStatus, BadgeProps["variant"]> = {
  PENDING: "warning",
  SCHEDULED: "default",
  ATTENDED: "success",
  NO_SHOW: "destructive",
  CANCELLED: "secondary",
  REJECTED: "destructive",
  RESCHEDULED: "secondary",
};

/**
 * Bloques de una hora ofrecidos para agendar (la rejilla de lib/labels.ts),
 * partidos en las dos filas que se muestran: mañana 9–12 + mediodía, y tarde
 * 2:30–5:30.
 */
const ALL_SLOTS: HourSlot[] = HOUR_SLOTS;
const MORNING_SLOTS = ALL_SLOTS.slice(0, 4);
const AFTERNOON_SLOTS = ALL_SLOTS.slice(4);

/** Estado de un bloque para el psicólogo (y el coterapeuta) y el día elegidos. */
interface SlotAvailability {
  startTime: string;
  available: boolean;
  code:
    | "UNAVAILABLE"
    | "PAST"
    | "EVENT"
    | "TAKEN"
    | "FULL"
    | "CO_UNAVAILABLE"
    | "CO_EVENT"
    | "CO_TAKEN"
    | null;
  reason: string | null;
}

function slotIndex(startTime: string) {
  return ALL_SLOTS.findIndex((s) => s.startTime === startTime);
}

/** Si `a` puede encadenarse justo antes de `b` (sin hueco entre ambos). */
function canChain(a: HourSlot, b: HourSlot) {
  return a.endTime === b.startTime;
}

/**
 * Deriva qué bloques estaban seleccionados a partir del horario guardado de
 * una cita existente. Solo funciona si ese horario coincide exactamente con
 * la rejilla de bloques de una hora; si no coincide (citas capturadas antes
 * de este cambio, con minutos u horas distintas), devuelve un arreglo vacío
 * y el horario original se conserva tal cual hasta que se elija uno nuevo.
 */
function slotsFromAppointment(scheduledAt: string, duration: number): string[] {
  const { time } = mxDayAndTime(new Date(scheduledAt));
  const startIdx = slotIndex(time);
  const count = Math.round(duration / 60);
  if (startIdx === -1 || count <= 0) return [];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const slot = ALL_SLOTS[startIdx + i];
    if (!slot) return [];
    if (i > 0 && !canChain(ALL_SLOTS[startIdx + i - 1], slot)) return [];
    result.push(slot.startTime);
  }
  return result;
}

interface Option {
  id: string;
  name: string;
}

interface PsychologistOption extends Option {
  speciality: Speciality;
}

/**
 * Estados que no cuentan para deducir si el paciente lleva coterapia: una
 * solicitud rechazada o una cita cancelada nunca llegó a ocurrir.
 */
const DISCARDED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.REJECTED,
  AppointmentStatus.CANCELLED,
];

/** Cita del paciente tal como viene en /api/patients/[id] (registro crudo). */
interface PatientAppointment {
  psychologistId: string;
  coTherapistId: string | null;
  scheduledAt: string;
  status: AppointmentStatus;
}

/**
 * El otro psicólogo que ya atiende al paciente junto con `psyId`, deducido de
 * su cita más reciente (sin contar rechazadas ni canceladas) en la que ese
 * psicólogo participa: si esa cita fue en coterapia, la nueva se prellena
 * igual. Devuelve null si la última fue individual o si ese psicólogo todavía
 * no ha atendido al paciente.
 */
function inferCoTherapistId(
  appointments: PatientAppointment[],
  psyId: string,
): string | null {
  if (!psyId) return null;
  const last = appointments
    .filter(
      (a) =>
        !DISCARDED_STATUSES.includes(a.status) &&
        (a.psychologistId === psyId || a.coTherapistId === psyId),
    )
    .sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
    )[0];
  if (!last?.coTherapistId) return null;
  return last.coTherapistId === psyId ? last.psychologistId : last.coTherapistId;
}

/** Datos del paciente que se muestran en el panel izquierdo al editar una cita. */
interface PatientInfo {
  fullName: string;
  fileNumber: string | null;
  cedafamFolio: string | null;
  age: number;
  phoneNumber: string;
  serviceArea: ServiceArea;
  referenceType: ReferenceType;
  consultationReason: string;
  /** Historial de citas del paciente; solo lo usa el prellenado de coterapia. */
  appointments?: PatientAppointment[];
}

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  role: Role;
  psychologistId: string | null;
  /** Editing an existing appointment, or null to create. */
  appointment?: CalendarAppointment | null;
  /** Pre-filled date (ISO) when creating from a day cell. */
  defaultDate?: string;
  /** Cita atendida a partir de la cual se prellena una cita nueva (Reagendar). */
  rescheduleFrom?: CalendarAppointment | null;
  /** Se dispara al pulsar "Reagendar" en una cita con estado Asistió. */
  onReschedule?: (appointment: CalendarAppointment) => void;
  /** Paciente y psicólogo prellenados al crear (p. ej. justo después de asignar). */
  initialPatientId?: string;
  initialPsychologistId?: string;
  /** Texto del botón de cierre sin guardar; por defecto "Cancelar". */
  cancelLabel?: string;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  onSaved,
  role,
  psychologistId,
  appointment,
  defaultDate,
  rescheduleFrom,
  onReschedule,
  initialPatientId,
  initialPsychologistId,
  cancelLabel,
}: AppointmentDialogProps) {
  const { toast } = useToast();
  const isEdit = !!appointment;
  const isPsychologist = role === Role.PSYCHOLOGIST;
  // La Recepción agenda directo (SCHEDULED) en vez de mandar una solicitud.
  const isDirectCreate = role === Role.ACCOUNTANT && !isEdit;

  // Categoría de la solicitud/cita que se está editando.
  const isPending = appointment?.status === AppointmentStatus.PENDING;
  const isRejected = appointment?.status === AppointmentStatus.REJECTED;
  const isConfirmed = isEdit && !isPending && !isRejected;
  // Quien atiende la cita, sin importar su rol de sistema: Admin, Jefe y
  // Coordinación también pueden tener pacientes propios como psicólogos.
  const isOwnPsychologistAppointment =
    !!psychologistId && appointment?.psychologist.id === psychologistId;
  // Una vez confirmada, el resto del formulario (día, hora, consultorio,
  // tipo, notas) solo lo toca quien es dueño de la agenda (Recepción, Jefe
  // o Coordinación); pero el Estado —incluido Cancelada y Reagendó— lo
  // puede cambiar tanto ellos como quien atiende la cita. Cualquier otro
  // usuario ya no puede tocarlo desde aquí.
  const canEditConfirmedStatus = can(role, "appointments:editConfirmed");
  const canChangeConfirmedStatus =
    canEditConfirmedStatus || isOwnPsychologistAppointment;
  const statusOptions = EDITABLE_STATUSES;
  // Quien es dueño de la agenda ve el formulario completo (día, hora,
  // consultorio, etc.) incluso en una cita ya confirmada.
  const showFullForm = !isConfirmed || canEditConfirmedStatus;

  const [patients, setPatients] = useState<Option[]>([]);
  const [psychologists, setPsychologists] = useState<PsychologistOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [psyId, setPsyId] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState<AppointmentServiceType>(
    AppointmentServiceType.THERAPY,
  );
  const [coTherapy, setCoTherapy] = useState(false);
  const [coTherapistId, setCoTherapistId] = useState("");
  // Coterapeuta que se prellenó solo, a partir del historial del paciente.
  // Sirve para avisar de dónde salió; deja de aplicar en cuanto el usuario
  // elige otro.
  const [prefilledCoTherapistId, setPrefilledCoTherapistId] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>(
    AppointmentStatus.SCHEDULED,
  );
  const [room, setRoom] = useState<string>(NO_ROOM);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotCount, setSlotCount] = useState<number | null>(null);
  const [slotInfo, setSlotInfo] = useState<Record<string, SlotAvailability> | null>(
    null,
  );
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [psyHasAvailability, setPsyHasAvailability] = useState(true);
  // null = la consulta no incluía coterapeuta.
  const [coHasAvailability, setCoHasAvailability] = useState<boolean | null>(
    null,
  );
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [patientInfoLoaded, setPatientInfoLoaded] = useState(false);

  const effectivePsyId = isPsychologist ? (psychologistId ?? "") : psyId;
  const coTherapistOptions = psychologists.filter(
    (p) => p.id !== effectivePsyId,
  );
  const effectivePsychologistSpeciality =
    psychologists.find((p) => p.id === effectivePsyId)?.speciality ?? null;

  const hasSlotSelection = selectedSlots.length > 0;
  // Ningún bloque de la rejilla queda libre ese día para ese psicólogo.
  const noSlotsFree =
    !!slotInfo && ALL_SLOTS.every((s) => slotBlockReason(s.startTime));
  // La agenda que se está llenando es la del propio usuario (aunque su rol sea
  // Jefe o Coordinación): cambia cómo se le habla de su disponibilidad.
  const isOwnSchedule = !!psychologistId && effectivePsyId === psychologistId;
  const effectiveDuration = hasSlotSelection
    ? selectedSlots.length * 60
    : (appointment?.duration ?? 60);
  const effectiveScheduledAtISO = hasSlotSelection
    ? dateStr
      ? mxSlotToISO(dateStr, selectedSlots[0])
      : null
    : (appointment?.scheduledAt ?? null);
  const effectiveDayTime = effectiveScheduledAtISO
    ? mxDayAndTime(new Date(effectiveScheduledAtISO))
    : null;

  // Solo enviar una solicitud nueva o reenviar una rechazada "agrega" una
  // solicitud activa al horario; editar una cita ya confirmada no aplica.
  const checksCapacity = !isEdit || isRejected;
  const slotFull =
    checksCapacity &&
    slotCount !== null &&
    slotCount >= MAX_CONCURRENT_APPOINTMENTS;

  const selectedPatientName =
    patients.find((p) => p.id === patientId)?.name ?? "";
  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    const list = q
      ? patients.filter((p) => p.name.toLowerCase().includes(q))
      : patients;
    return list.slice(0, 50);
  }, [patients, patientQuery]);

  function toggleSlot(startTime: string) {
    setSelectedSlots((prev) => {
      if (prev.length === 0) return [startTime];
      if (prev.length === 1 && prev[0] === startTime) return [];
      if (startTime === prev[prev.length - 1]) return prev.slice(0, -1);
      if (startTime === prev[0]) return prev.slice(1);
      const idx = slotIndex(startTime);
      const lastIdx = slotIndex(prev[prev.length - 1]);
      const firstIdx = slotIndex(prev[0]);
      if (idx === lastIdx + 1 && canChain(ALL_SLOTS[lastIdx], ALL_SLOTS[idx])) {
        return [...prev, startTime];
      }
      if (
        idx === firstIdx - 1 &&
        canChain(ALL_SLOTS[idx], ALL_SLOTS[firstIdx])
      ) {
        return [startTime, ...prev];
      }
      // No es contiguo a la selección actual: empieza un rango nuevo.
      return [startTime];
    });
  }

  /**
   * Por qué no se puede agendar en ese bloque, o `null` si sí se puede.
   * Mientras la disponibilidad no ha cargado (`slotInfo` nulo) no se bloquea
   * nada: el servidor revalida al guardar.
   */
  function slotBlockReason(startTime: string): string | null {
    const info = slotInfo?.[startTime];
    if (!info || info.available) return null;
    // Quien es dueño de la agenda puede registrar una cita que ya ocurrió
    // (corregir el expediente), así que un bloque pasado no lo detiene.
    if (info.code === "PAST" && canEditConfirmedStatus) return null;
    return info.reason ?? "No disponible";
  }

  /** Explicación bajo la rejilla de horarios, según a quién le falta cupo. */
  function slotHint(): string {
    const withCo = coTherapy && !!coTherapistId;
    const psyMissing = !psyHasAvailability;
    const coMissing = withCo && coHasAvailability === false;

    if (psyMissing && coMissing) {
      return "Ni el psicólogo ni el coterapeuta tienen disponibilidad registrada en su reporte semanal, así que se ofrecen todos los horarios.";
    }
    if (psyMissing) {
      return isOwnSchedule
        ? "Todavía no registras tu disponibilidad en el reporte semanal, así que se ofrecen todos los horarios."
        : "Este psicólogo aún no registra su disponibilidad en el reporte semanal, así que se ofrecen todos los horarios.";
    }
    if (coMissing) {
      return "El coterapeuta aún no registra su disponibilidad en el reporte semanal, así que solo limitan los horarios sus citas y eventos.";
    }
    if (noSlotsFree) {
      return withCo
        ? "Ese día no hay ningún horario en que coincidan los dos. Elige otro día o cambia de coterapeuta."
        : isOwnSchedule
          ? "No te queda ningún horario libre ese día según tu reporte semanal. Elige otro día."
          : "No le queda ningún horario libre ese día según su reporte semanal. Elige otro día.";
    }
    return withCo
      ? "Solo se pueden elegir los horarios en que los dos marcaron disponibilidad en su reporte semanal y siguen libres."
      : isOwnSchedule
        ? "Solo puedes elegir los horarios que marcaste como disponibles en tu reporte semanal y que sigan libres."
        : "Solo se pueden elegir los horarios que el psicólogo marcó como disponibles en su reporte semanal y que sigan libres.";
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPatientOpen(false);
    setPatientQuery("");

    // Lista de psicólogos activos: para el selector principal (si aplica) y
    // siempre para el de coterapia.
    fetch("/api/psychologists")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PsychologistOption[]) => setPsychologists(data));

    if (appointment) {
      setPatientId(appointment.patientId);
      setPsyId(appointment.psychologist.id);
      setDateStr(formatMxDateInput(appointment.scheduledAt));
      setSelectedSlots(
        slotsFromAppointment(appointment.scheduledAt, appointment.duration),
      );
      setServiceType(appointment.serviceType);
      setCoTherapy(!!appointment.coTherapist);
      setCoTherapistId(appointment.coTherapist?.id ?? "");
      setPrefilledCoTherapistId("");
      setStatus(appointment.status);
      setRoom(appointment.room ?? NO_ROOM);
      setNotes(appointment.notes ?? "");

      setPatientInfo(null);
      setPatientInfoLoaded(false);
      fetch(`/api/patients/${appointment.patientId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: PatientInfo | null) => setPatientInfo(data))
        .catch(() => setPatientInfo(null))
        .finally(() => setPatientInfoLoaded(true));
    } else if (rescheduleFrom) {
      // Prellena una cita nueva con los mismos datos, el mismo día de la
      // semana y el mismo horario, siete días después de la cita atendida.
      setPatientId(rescheduleFrom.patientId);
      setPsyId(rescheduleFrom.psychologist.id);
      const nextWeek = new Date(
        new Date(rescheduleFrom.scheduledAt).getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      setDateStr(formatMxDateInput(nextWeek));
      setSelectedSlots(
        slotsFromAppointment(rescheduleFrom.scheduledAt, rescheduleFrom.duration),
      );
      setServiceType(rescheduleFrom.serviceType);
      setCoTherapy(!!rescheduleFrom.coTherapist);
      setCoTherapistId(rescheduleFrom.coTherapist?.id ?? "");
      setPrefilledCoTherapistId("");
      setStatus(AppointmentStatus.SCHEDULED);
      setRoom(rescheduleFrom.room ?? NO_ROOM);
      setNotes(rescheduleFrom.notes ?? "");
      setPatientInfo(null);
      setPatientInfoLoaded(false);
    } else {
      setPatientId(initialPatientId ?? "");
      setPsyId(
        isPsychologist ? (psychologistId ?? "") : (initialPsychologistId ?? ""),
      );
      setDateStr(
        defaultDate
          ? formatMxDateInput(defaultDate)
          : formatMxDateInput(new Date()),
      );
      setSelectedSlots([]);
      setServiceType(AppointmentServiceType.THERAPY);
      setCoTherapy(false);
      setCoTherapistId("");
      setPrefilledCoTherapistId("");
      setStatus(AppointmentStatus.SCHEDULED);
      setRoom(NO_ROOM);
      setNotes("");
      setPatientInfo(null);
      setPatientInfoLoaded(false);
    }
  }, [
    open,
    appointment,
    rescheduleFrom,
    defaultDate,
    isPsychologist,
    psychologistId,
    initialPatientId,
    initialPsychologistId,
  ]);

  // Scope the patient list to whichever psychologist the appointment is
  // for, so Coordinación/Jefe only see that psychologist's own patients
  // instead of every patient in the practice.
  useEffect(() => {
    if (!open || isEdit) return;
    if (!effectivePsyId) {
      setPatients([]);
      return;
    }
    fetch(`/api/patients?psychologistId=${effectivePsyId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; fullName: string }[]) =>
        setPatients(data.map((p) => ({ id: p.id, name: p.fullName }))),
      );
  }, [open, isEdit, effectivePsyId]);

  // Preselecciona, a partir del paciente elegido al crear una cita nueva:
  //   · "Tipo de servicio" según su área real (Evaluación psicológica/
  //     Neuropsicológica → Evaluación, el resto → Terapia).
  //   · "Coterapia" y el coterapeuta, si ese paciente ya se atiende en
  //     coterapia con el psicólogo seleccionado. Así los horarios que se
  //     ofrecen cruzan de entrada la disponibilidad de los dos.
  // Ambos siguen siendo editables a mano: si el usuario elige un paciente
  // distinto, se vuelven a calcular para ese paciente. En Reagendar no
  // aplica: ahí el prellenado sale de la cita de origen.
  useEffect(() => {
    if (!open || isEdit || rescheduleFrom || !patientId) return;
    let cancelled = false;
    fetch(`/api/patients/${patientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PatientInfo | null) => {
        if (cancelled || !data) return;
        setServiceType(
          data.serviceArea === ServiceArea.PSYCHOLOGICAL_EVALUATION ||
            data.serviceArea === ServiceArea.NEUROPSYCHOLOGICAL
            ? AppointmentServiceType.EVALUATION
            : AppointmentServiceType.THERAPY,
        );
        const coId = inferCoTherapistId(
          data.appointments ?? [],
          effectivePsyId,
        );
        setCoTherapy(!!coId);
        setCoTherapistId(coId ?? "");
        setPrefilledCoTherapistId(coId ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, rescheduleFrom, patientId, effectivePsyId]);

  // Horarios que el psicólogo declaró disponibles en su reporte semanal para
  // el día elegido, ya descontando lo que se le ocupó (eventos, otras citas,
  // consultorios llenos). Sin esto la rejilla ofrecía las ocho horas a todo
  // el mundo, ignorando lo que el psicólogo llenó en su reporte. En coterapia
  // se cruza además con la disponibilidad del coterapeuta: el horario tiene
  // que servirles a los dos.
  useEffect(() => {
    if (!open || !showFullForm || !effectivePsyId || !dateStr) {
      setSlotInfo(null);
      return;
    }
    const params = new URLSearchParams({
      psychologistId: effectivePsyId,
      date: dateStr,
      duration: "60",
    });
    if (coTherapy && coTherapistId) params.set("coTherapistId", coTherapistId);
    if (appointment) params.set("excludeId", appointment.id);

    let cancelled = false;
    setSlotsLoading(true);
    fetch(`/api/appointments/available-slots?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            hasAvailability: boolean;
            coHasAvailability: boolean | null;
            slots: SlotAvailability[];
          } | null,
        ) => {
          if (cancelled) return;
          if (!data) {
            setSlotInfo(null);
            return;
          }
          setPsyHasAvailability(data.hasAvailability);
          setCoHasAvailability(data.coHasAvailability);
          setSlotInfo(
            Object.fromEntries(data.slots.map((s) => [s.startTime, s])),
          );
        },
      )
      .catch(() => {
        if (!cancelled) setSlotInfo(null);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    showFullForm,
    effectivePsyId,
    dateStr,
    coTherapy,
    coTherapistId,
    appointment,
  ]);

  // Si al cambiar de día o de psicólogo la selección deja de estar disponible,
  // se recorta: se conservan los bloques seguidos que sí siguen libres desde
  // el primero, para no dejar una selección con huecos (la duración se calcula
  // como bloques × 60 min a partir del primero).
  useEffect(() => {
    if (!slotInfo) return;
    setSelectedSlots((prev) => {
      const kept: string[] = [];
      for (const startTime of prev) {
        if (slotBlockReason(startTime)) break;
        kept.push(startTime);
      }
      return kept.length === prev.length ? prev : kept;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotInfo]);

  // Si al cambiar de día/hora el consultorio elegido queda bloqueado (p. ej.
  // Consultorio 2 los jueves por la tarde), se limpia para forzar a elegir
  // otro; ya no aparece como opción en el selector.
  useEffect(() => {
    if (
      room !== NO_ROOM &&
      effectiveDayTime &&
      isRoomBlockedAt(
        room as Room,
        effectiveDayTime.dayOfWeek,
        effectiveDayTime.time,
        effectivePsychologistSpeciality,
      )
    ) {
      setRoom(NO_ROOM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveDayTime?.dayOfWeek,
    effectiveDayTime?.time,
    effectivePsychologistSpeciality,
  ]);

  // Aviso en vivo: cuántas solicitudes/citas activas ya hay en ese horario,
  // para avisar antes de enviar si ya se llegó al máximo de consultorios.
  useEffect(() => {
    if (!open || !checksCapacity || !effectiveScheduledAtISO) {
      setSlotCount(null);
      return;
    }
    const params = new URLSearchParams({
      scheduledAt: effectiveScheduledAtISO,
      duration: String(effectiveDuration),
    });
    if (appointment) params.set("excludeId", appointment.id);

    const timer = setTimeout(() => {
      fetch(`/api/appointments/slot-capacity?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { count: number } | null) =>
          setSlotCount(data?.count ?? null),
        )
        .catch(() => setSlotCount(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [
    open,
    checksCapacity,
    effectiveScheduledAtISO,
    effectiveDuration,
    appointment,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!effectiveScheduledAtISO) {
      setError("Selecciona un horario.");
      return;
    }
    if (coTherapy && !coTherapistId) {
      setError("Selecciona el psicólogo coterapeuta.");
      return;
    }

    setSubmitting(true);

    const url = isEdit
      ? `/api/appointments/${appointment!.id}`
      : "/api/appointments";
    const method = isEdit ? "PUT" : "POST";
    const roomValue = room === NO_ROOM ? null : (room as Room);
    const effCoTherapistId = coTherapy ? coTherapistId : null;

    let payload: Record<string, unknown>;
    if (!isEdit) {
      payload = {
        patientId,
        psychologistId: isPsychologist ? psychologistId : psyId,
        coTherapistId: effCoTherapistId,
        scheduledAt: effectiveScheduledAtISO,
        duration: effectiveDuration,
        serviceType,
        room: roomValue,
        notes,
        // Reagendar una cita ya asistida se agenda directo, sin pasar por
        // solicitudes de Recepción.
        isReschedule: !!rescheduleFrom,
      };
    } else {
      payload = {
        scheduledAt: effectiveScheduledAtISO,
        duration: effectiveDuration,
        serviceType,
        coTherapistId: effCoTherapistId,
        room: roomValue,
        notes,
      };
      if (isRejected) {
        // Reenviar la solicitud: vuelve a PENDING.
        payload.resend = true;
      } else if (isConfirmed) {
        payload.status = status;
      }
      // PENDING: sin status ni resend → la solicitud sigue pendiente.
    }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar la solicitud.");
      return;
    }
    toast({
      title: !isEdit
        ? isDirectCreate || rescheduleFrom
          ? "Cita agendada"
          : "Solicitud enviada"
        : isRejected
          ? "Solicitud reenviada"
          : isPending
            ? "Solicitud actualizada"
            : "Cita actualizada",
      variant: "success",
    });
    onSaved();
    onOpenChange(false);
  }

  const title = !isEdit
    ? rescheduleFrom
      ? "Reagendar cita"
      : isDirectCreate
        ? "Agendar cita"
        : "Nueva solicitud de cita"
    : isPending
      ? "Solicitud pendiente"
      : isRejected
        ? "Solicitud rechazada"
        : "Editar cita";

  const submitLabel = !isEdit
    ? isDirectCreate || rescheduleFrom
      ? "Agendar cita"
      : "Enviar solicitud"
    : isRejected
      ? "Reenviar solicitud"
      : "Guardar cambios";

  function SlotButton({ slot }: { slot: HourSlot }) {
    const active = selectedSlots.includes(slot.startTime);
    const blocked = slotBlockReason(slot.startTime);
    return (
      <button
        type="button"
        disabled={!!blocked}
        title={blocked ?? undefined}
        onClick={() => toggleSlot(slot.startTime)}
        className={cn(
          "flex flex-col items-center rounded-md border px-3 py-1.5 text-sm transition-colors",
          blocked
            ? "cursor-not-allowed border-dashed border-border/50 text-muted-foreground/50"
            : active
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-accent",
        )}
      >
        <span className={cn(blocked && "line-through")}>{slot.label}</span>
        {blocked && <span className="text-[11px] leading-tight">{blocked}</span>}
      </button>
    );
  }

  function PanelField({ label, value }: { label: string; value: string }) {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    );
  }

  /** Panel izquierdo con los datos del paciente, visible al editar una cita. */
  function PatientInfoPanel() {
    if (!appointment) return null;
    return (
      <div className="space-y-3 border-b pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
        <div>
          <p className="font-semibold leading-tight">
            {appointment.patient.fullName}
          </p>
          {patientInfo && (
            <p className="text-sm text-muted-foreground">
              {patientInfo.age} años ·{" "}
              {serviceAreaLabels[patientInfo.serviceArea]}
            </p>
          )}
        </div>
        {patientInfo ? (
          <div className="space-y-2">
            <PanelField label="Teléfono" value={patientInfo.phoneNumber} />
            {(patientInfo.cedafamFolio || patientInfo.fileNumber) && (
              <PanelField
                label="Folio"
                value={
                  patientInfo.cedafamFolio ?? patientInfo.fileNumber ?? "—"
                }
              />
            )}
            <PanelField
              label="Referencia"
              value={referenceTypeLabels[patientInfo.referenceType]}
            />
            <div>
              <p className="text-xs text-muted-foreground">
                Motivo de consulta
              </p>
              <p className="text-sm">{patientInfo.consultationReason}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {patientInfoLoaded
              ? "No se pudo cargar más información."
              : "Cargando…"}
          </p>
        )}
        <Button asChild variant="link" className="h-auto p-0 text-sm">
          <Link href={`/dashboard/patients/${appointment.patientId}`}>
            Ver expediente completo
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(isEdit && "sm:max-w-3xl")}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {isEdit && appointment && (
              <Badge variant={statusVariant[appointment.status]}>
                {appointmentStatusLabels[appointment.status]}
              </Badge>
            )}
            {isEdit && appointment && (
              <Badge
                variant="outline"
                className={
                  appointment.isFirstVisit
                    ? "border-sky-500/50 bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
                    : "text-muted-foreground"
                }
              >
                {appointment.isFirstVisit ? "Primera vez" : "Seguimiento"}
              </Badge>
            )}
            {isEdit &&
              appointment &&
              appointment.status === AppointmentStatus.ATTENDED &&
              onReschedule && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => onReschedule(appointment)}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Reagendar
                </Button>
              )}
          </div>
          {!isEdit && (
            <DialogDescription>
              {rescheduleFrom
                ? `Cita nueva para ${rescheduleFrom.patient.fullName}, prellenada para el mismo horario una semana después. Puedes editar cualquier dato antes de guardar.`
                : isDirectCreate
                  ? "La cita queda agendada de inmediato."
                  : "Propuesta sujeta a cambios según la disponibilidad del paciente y de los consultorios."}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Motivo del rechazo — el psicólogo debe proponer nueva fecha y reenviar. */}
        {isRejected && appointment?.rejectionReason && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                Solicitud rechazada por la Recepción
              </p>
              <p className="mt-0.5 text-foreground">
                {appointment.rejectionReason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Propón una nueva fecha y hora y reenvía la solicitud.
              </p>
            </div>
          </div>
        )}

        <div className={cn(isEdit && "grid gap-6 sm:grid-cols-[220px_1fr]")}>
          {isEdit && <PatientInfoPanel />}

          <form onSubmit={onSubmit} className="space-y-4">
            {!isEdit && !isPsychologist && (
              <div className="space-y-2">
                <Label>Psicólogo *</Label>
                <Select
                  value={psyId}
                  onValueChange={(v) => {
                    setPsyId(v);
                    setPatientId("");
                    setPatientQuery("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un psicólogo" />
                  </SelectTrigger>
                  <SelectContent>
                    {psychologists.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isEdit && (
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <div className="relative">
                  <button
                    type="button"
                    disabled={!effectivePsyId}
                    onClick={() => setPatientOpen((o) => !o)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      className={cn(
                        !selectedPatientName && "text-muted-foreground",
                      )}
                    >
                      {selectedPatientName ||
                        (effectivePsyId
                          ? "Selecciona un paciente"
                          : "Selecciona un psicólogo primero")}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </button>
                  {patientOpen && (
                    <>
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setPatientOpen(false)}
                      />
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                        <div className="relative mb-1">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                          <Input
                            autoFocus
                            value={patientQuery}
                            onChange={(e) => setPatientQuery(e.target.value)}
                            placeholder="Buscar por nombre…"
                            className="h-9 pl-8"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {filteredPatients.length === 0 ? (
                            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                              Sin resultados
                            </p>
                          ) : (
                            filteredPatients.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setPatientId(p.id);
                                  setPatientOpen(false);
                                  setPatientQuery("");
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                              >
                                <span className="truncate">{p.name}</span>
                                {p.id === patientId && (
                                  <Check className="h-4 w-4 shrink-0" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {isConfirmed && (
              <div className="space-y-2">
                <Label>Estado</Label>
                {canChangeConfirmedStatus ? (
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as AppointmentStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {appointmentStatusLabels[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-md border bg-muted px-3 py-2 text-sm">
                    {appointmentStatusLabels[status]}
                  </p>
                )}
                {isOwnPsychologistAppointment && !canEditConfirmedStatus && (
                  <p className="text-xs text-muted-foreground">
                    Puedes cambiar el estado de tu cita. El horario, el
                    consultorio y los demás datos solo los modifica la
                    Recepción, el Jefe o Coordinación.
                  </p>
                )}
                {!canChangeConfirmedStatus && (
                  <p className="text-xs text-muted-foreground">
                    Solo la Recepción, el Jefe o Coordinación pueden
                    modificar una cita ya confirmada.
                  </p>
                )}
              </div>
            )}

            {showFullForm && (
              <>
                {isPending && (
                  <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Cualquier cambio que guardes se enviará de nuevo a la
                      Recepción para su revisión.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Día *</Label>
                  <CalendarDayPicker
                    value={dateStr}
                    onChange={setDateStr}
                    // Quien es dueño de la agenda también puede mover una
                    // cita a un día anterior (p. ej. corregir el registro);
                    // el resto solo agenda hacia adelante.
                    minDate={
                      canEditConfirmedStatus
                        ? undefined
                        : formatMxDateInput(new Date())
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duración (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    readOnly
                    disabled
                    value={effectiveDuration}
                    className="max-w-[160px] bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Horarios *</Label>
                    {slotsLoading && (
                      <span className="text-xs text-muted-foreground">
                        Cargando disponibilidad…
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      {MORNING_SLOTS.map((s) => (
                        <SlotButton key={s.startTime} slot={s} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AFTERNOON_SLOTS.map((s) => (
                        <SlotButton key={s.startTime} slot={s} />
                      ))}
                    </div>
                  </div>
                  {slotInfo && !slotsLoading && (
                    <p className="text-xs text-muted-foreground">{slotHint()}</p>
                  )}
                  {isEdit && !hasSlotSelection && appointment && (
                    <p className="text-xs text-muted-foreground">
                      Horario actual: {formatMxTime(appointment.scheduledAt)},{" "}
                      {appointment.duration} min. Selecciona bloques arriba para
                      cambiarlo.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo de servicio</Label>
                    <Select
                      value={serviceType}
                      onValueChange={(v) =>
                        setServiceType(v as AppointmentServiceType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(AppointmentServiceType).map((t) => (
                          <SelectItem key={t} value={t}>
                            {appointmentServiceTypeLabels[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Coterapia</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={coTherapy ? "outline" : "default"}
                        onClick={() => setCoTherapy(false)}
                      >
                        No
                      </Button>
                      <Button
                        type="button"
                        variant={coTherapy ? "default" : "outline"}
                        onClick={() => setCoTherapy(true)}
                      >
                        Sí
                      </Button>
                    </div>
                  </div>
                </div>

                {coTherapy && (
                  <div className="space-y-2">
                    <Label>Psicólogo coterapeuta *</Label>
                    <Select
                      value={coTherapistId}
                      onValueChange={setCoTherapistId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un psicólogo" />
                      </SelectTrigger>
                      <SelectContent>
                        {coTherapistOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!!prefilledCoTherapistId &&
                      coTherapistId === prefilledCoTherapistId && (
                        <p className="text-xs text-muted-foreground">
                          Se prellenó porque este paciente ya se atiende en
                          coterapia con este psicólogo. Los horarios que se
                          ofrecen son los que les quedan libres a los dos.
                        </p>
                      )}
                    <p className="text-xs text-muted-foreground">
                      {isDirectCreate
                        ? "También aparecerá en el calendario de este psicólogo."
                        : "Al aprobarse la cita, también aparecerá en el calendario de este psicólogo."}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Consultorio *</Label>
                  <Select value={room} onValueChange={setRoom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un consultorio" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Room)
                        .filter(
                          (r) =>
                            (isConfirmed ||
                              PREFERENCE_ROOMS.includes(r) ||
                              r === appointment?.room ||
                              r === rescheduleFrom?.room) &&
                            !(
                              effectiveDayTime &&
                              isRoomBlockedAt(
                                r,
                                effectiveDayTime.dayOfWeek,
                                effectiveDayTime.time,
                                effectivePsychologistSpeciality,
                              )
                            ),
                        )
                        .map((r) => (
                          <SelectItem key={r} value={r}>
                            {roomLabels[r]}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {isConfirmed
                      ? "El consultorio queda reservado para esta cita en cuanto guardes los cambios."
                      : isDirectCreate
                        ? "Queda reservado en el Tablero de Consultorios en cuanto se guarde la cita."
                        : "La Recepción confirma la disponibilidad de este consultorio al aprobar la solicitud."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            )}

            {slotFull && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-destructive">
                  Ya hay {MAX_CONCURRENT_APPOINTMENTS} solicitudes o citas
                  activas en ese horario (el máximo de consultorios
                  disponibles). Elige otra fecha u hora.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {cancelLabel ?? "Cancelar"}
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting ||
                  (!isEdit && !patientId) ||
                  !effectiveScheduledAtISO ||
                  (coTherapy && !coTherapistId) ||
                  room === NO_ROOM ||
                  slotFull
                }
              >
                {submitting ? "Guardando…" : submitLabel}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
