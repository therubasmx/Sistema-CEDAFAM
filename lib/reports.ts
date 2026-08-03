import {
  ServiceArea,
  TherapyStatus,
  EvaluationStatus,
  ServiceType,
  PatientType,
  AppointmentStatus,
  AppointmentServiceType,
  DiscountLevel,
} from "@prisma/client";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { db } from "@/lib/db";
import {
  serviceAreaLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
  patientTypeLabels,
  discountLevelLabels,
  specialityLabels,
  workTypeLabels,
} from "@/lib/labels";

export type ReportGranularity = "day" | "week" | "month";

export interface PeriodRow {
  period: string;
  PSYCHOLOGY: number;
  PSYCHIATRY: number;
  PSYCHOLOGICAL_EVALUATION: number;
  NEUROPSYCHOLOGICAL: number;
  total: number;
}

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface ReportData {
  range: { start: string; end: string };
  granularity: ReportGranularity;
  earliestPatientDate: string | null;
  newPatientsByPeriod: PeriodRow[];
  patientsByTherapyStatus: CountRow[];
  patientsByPsychiatryStatus: CountRow[];
  patientsByPsychEvaluationStatus: CountRow[];
  patientsByNeuroEvaluationStatus: CountRow[];
  patientsByType: CountRow[];
  /** Desglose por nivel de descuento, solo entre pacientes de tipo SIERE. */
  patientsBySiereLevel: CountRow[];
  topReasons: CountRow[];
  averageDuration: { therapyMonths: number; evaluationWeeks: number };
  dropout: { totalWithStatus: number; neverCame: number; voluntaryDischarge: number; rate: number };
  totals: { newPatients: number };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** Picks how to bucket the "new patients" chart based on the range length. */
function pickGranularity(start: Date, end: Date): ReportGranularity {
  const days = differenceInCalendarDays(end, start);
  if (days <= 31) return "day";
  if (days <= 90) return "week";
  return "month";
}

interface Bucket {
  label: string;
  start: Date;
  end: Date;
}

/** Tiles [start, end) into day/week/month buckets for the period chart. */
function buildBuckets(start: Date, end: Date, granularity: ReportGranularity): Bucket[] {
  const buckets: Bucket[] = [];

  if (granularity === "day") {
    let cur = start;
    while (cur < end) {
      const next = addDays(cur, 1);
      buckets.push({ label: format(cur, "d MMM", { locale: es }), start: cur, end: next });
      cur = next;
    }
    return buckets;
  }

  if (granularity === "week") {
    let cur = start;
    while (cur < end) {
      const next = addDays(cur, 7);
      const bucketEnd = next < end ? next : end;
      const lastDay = addDays(bucketEnd, -1);
      buckets.push({
        label: `${format(cur, "d MMM", { locale: es })}–${format(lastDay, "d MMM", { locale: es })}`,
        start: cur,
        end: bucketEnd,
      });
      cur = next;
    }
    return buckets;
  }

  let cur = startOfMonth(start);
  const last = startOfMonth(addDays(end, -1));
  while (cur <= last) {
    const next = addMonths(cur, 1);
    buckets.push({ label: format(cur, "MMM yy", { locale: es }), start: cur, end: next });
    cur = next;
  }
  return buckets;
}

function bucketIndex(date: Date, start: Date, granularity: ReportGranularity): number {
  if (granularity === "day") return differenceInCalendarDays(date, start);
  if (granularity === "week") return Math.floor(differenceInCalendarDays(date, start) / 7);
  return differenceInCalendarMonths(startOfMonth(date), startOfMonth(start));
}

/**
 * Builds all report data for a date range.
 * @param start inclusive
 * @param end exclusive
 */
export async function buildReport(start: Date, end: Date): Promise<ReportData> {
  const [rangePatients, allStatuses, firstPatient, typeUpdates, datedFolios] = await Promise.all([
    db.patient.findMany({
      // isHistorical: false — los pacientes previos al sistema no son "nuevos" y
      // su createdAt puede ser solo la fecha en que se importaron, no la real.
      where: { createdAt: { gte: start, lt: end }, isHistorical: false },
      select: { createdAt: true, serviceArea: true, consultationReason: true },
    }),
    // Cambios de estado ocurridos dentro del rango (evento = changedAt).
    db.patientStatus.findMany({
      where: { changedAt: { gte: start, lt: end } },
      select: {
        patientId: true,
        serviceType: true,
        therapyStatus: true,
        evaluationStatus: true,
        changedAt: true,
        patient: { select: { createdAt: true, serviceArea: true } },
      },
      orderBy: { changedAt: "asc" },
    }),
    db.patient.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    // Tipo de px (y nivel SIERE) reportado en semanas dentro del rango (evento = semana del reporte).
    db.weeklyReportPatientUpdate.findMany({
      where: { patientType: { not: null }, weeklyReport: { weekStartDate: { gte: start, lt: end } } },
      select: { patientId: true, patientType: true, discountLevel: true },
      orderBy: { weeklyReport: { weekStartDate: "asc" } },
    }),
    // Folios cuya entrega de resultados cayó dentro del rango (evento = resultsDeliveryAt).
    // Los históricos se van llenando poco a poco; se incluyen solos conforme se
    // les captura la fecha exacta.
    db.evaluationFolio.findMany({
      where: {
        firstInterviewAt: { not: null },
        resultsDeliveryAt: { gte: start, lt: end },
      },
      select: { firstInterviewAt: true, resultsDeliveryAt: true },
    }),
  ]);

  // 1) New patients per period (day/week/month, chosen by range length), split by service area.
  const granularity = pickGranularity(start, end);
  const buckets = buildBuckets(start, end, granularity);
  const periods: PeriodRow[] = buckets.map((b) => ({
    period: b.label,
    PSYCHOLOGY: 0,
    PSYCHIATRY: 0,
    PSYCHOLOGICAL_EVALUATION: 0,
    NEUROPSYCHOLOGICAL: 0,
    total: 0,
  }));
  for (const p of rangePatients) {
    const idx = bucketIndex(p.createdAt, start, granularity);
    const row = periods[idx];
    if (!row) continue; // guards against edge rounding
    row[p.serviceArea]++;
    row.total++;
  }

  // 2) Patients by status — último cambio de estado ocurrido dentro del rango, por paciente.
  const latestByPatient = new Map<
    string,
    (typeof allStatuses)[number]
  >();
  for (const s of allStatuses) latestByPatient.set(s.patientId, s); // asc order → last wins

  const therapyCounts = new Map<TherapyStatus, number>();
  const psychiatryCounts = new Map<TherapyStatus, number>();
  const psychEvalCounts = new Map<EvaluationStatus, number>();
  const neuroEvalCounts = new Map<EvaluationStatus, number>();
  for (const s of latestByPatient.values()) {
    if (s.therapyStatus) {
      const counts = s.serviceType === ServiceType.PSYCHIATRY ? psychiatryCounts : therapyCounts;
      counts.set(s.therapyStatus, (counts.get(s.therapyStatus) ?? 0) + 1);
    }
    if (s.evaluationStatus) {
      const evalCounts =
        s.patient.serviceArea === ServiceArea.NEUROPSYCHOLOGICAL
          ? neuroEvalCounts
          : psychEvalCounts;
      evalCounts.set(s.evaluationStatus, (evalCounts.get(s.evaluationStatus) ?? 0) + 1);
    }
  }

  const patientsByTherapyStatus: CountRow[] = Object.values(TherapyStatus).map((k) => ({
    key: k,
    label: therapyStatusLabels[k],
    count: therapyCounts.get(k) ?? 0,
  }));
  const patientsByPsychiatryStatus: CountRow[] = Object.values(TherapyStatus).map((k) => ({
    key: k,
    label: therapyStatusLabels[k],
    count: psychiatryCounts.get(k) ?? 0,
  }));
  const patientsByPsychEvaluationStatus: CountRow[] = Object.values(EvaluationStatus).map(
    (k) => ({
      key: k,
      label: evaluationStatusLabels[k],
      count: psychEvalCounts.get(k) ?? 0,
    }),
  );
  const patientsByNeuroEvaluationStatus: CountRow[] = Object.values(EvaluationStatus).map(
    (k) => ({
      key: k,
      label: evaluationStatusLabels[k],
      count: neuroEvalCounts.get(k) ?? 0,
    }),
  );

  // 2b) Patients by type (tipo de px) — último tipo (y nivel SIERE) reportado
  // dentro del rango, por paciente. Ambos vienen del mismo registro para que
  // el nivel corresponda siempre al reporte que determinó el tipo final.
  const latestTypeByPatient = new Map<
    string,
    { patientType: PatientType; discountLevel: DiscountLevel | null }
  >();
  for (const u of typeUpdates) {
    if (u.patientType) {
      latestTypeByPatient.set(u.patientId, {
        patientType: u.patientType,
        discountLevel: u.discountLevel,
      }); // asc order → last wins
    }
  }
  const typeCounts = new Map<PatientType, number>();
  const siereLevelCounts = new Map<DiscountLevel, number>();
  for (const { patientType, discountLevel } of latestTypeByPatient.values()) {
    typeCounts.set(patientType, (typeCounts.get(patientType) ?? 0) + 1);
    if (patientType === PatientType.SIERE && discountLevel) {
      siereLevelCounts.set(discountLevel, (siereLevelCounts.get(discountLevel) ?? 0) + 1);
    }
  }
  const patientsByType: CountRow[] = Object.values(PatientType).map((k) => ({
    key: k,
    label: patientTypeLabels[k],
    count: typeCounts.get(k) ?? 0,
  }));
  const patientsBySiereLevel: CountRow[] = Object.values(DiscountLevel).map((k) => ({
    key: k,
    label: discountLevelLabels[k],
    count: siereLevelCounts.get(k) ?? 0,
  }));

  // 3) Top 10 consultation reasons within the range (normalized by lowercase).
  const reasonCounts = new Map<string, { label: string; count: number }>();
  for (const p of rangePatients) {
    const raw = p.consultationReason.trim();
    if (!raw) continue;
    const norm = raw.toLowerCase();
    const entry = reasonCounts.get(norm) ?? { label: raw, count: 0 };
    entry.count++;
    reasonCounts.set(norm, entry);
  }
  const topReasons: CountRow[] = [...reasonCounts.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 4) Average duration: therapy in months (discharges within the range),
  // evaluation in weeks (folios whose results delivery fell within the range).
  let therapySum = 0;
  let therapyN = 0;
  for (const s of allStatuses) {
    const base = s.patient.createdAt.getTime();
    const span = s.changedAt.getTime() - base;
    if (span <= 0) continue;
    if (
      s.serviceType === ServiceType.THERAPY &&
      (s.therapyStatus === TherapyStatus.THERAPEUTIC_DISCHARGE ||
        s.therapyStatus === TherapyStatus.VOLUNTARY_DISCHARGE)
    ) {
      therapySum += span / MS_PER_MONTH;
      therapyN++;
    }
  }

  let evalSum = 0;
  let evalN = 0;
  for (const f of datedFolios) {
    if (!f.firstInterviewAt || !f.resultsDeliveryAt) continue;
    const span = f.resultsDeliveryAt.getTime() - f.firstInterviewAt.getTime();
    if (span <= 0) continue;
    evalSum += span / MS_PER_WEEK;
    evalN++;
  }

  // 5) Dropout rate: (NEVER_CAME + VOLUNTARY_DISCHARGE) over patients with a
  // therapy status change within the range.
  const therapyTotal = [...therapyCounts.values()].reduce((a, b) => a + b, 0);
  const neverCame = therapyCounts.get(TherapyStatus.NEVER_CAME) ?? 0;
  const voluntaryDischarge = therapyCounts.get(TherapyStatus.VOLUNTARY_DISCHARGE) ?? 0;
  const dropoutCount = neverCame + voluntaryDischarge;

  return {
    range: { start: format(start, "yyyy-MM-dd"), end: format(addDays(end, -1), "yyyy-MM-dd") },
    granularity,
    earliestPatientDate: firstPatient ? format(firstPatient.createdAt, "yyyy-MM-dd") : null,
    newPatientsByPeriod: periods,
    patientsByTherapyStatus,
    patientsByPsychiatryStatus,
    patientsByPsychEvaluationStatus,
    patientsByNeuroEvaluationStatus,
    patientsByType,
    patientsBySiereLevel,
    topReasons,
    averageDuration: {
      therapyMonths: therapyN ? Number((therapySum / therapyN).toFixed(1)) : 0,
      evaluationWeeks: evalN ? Number((evalSum / evalN).toFixed(1)) : 0,
    },
    dropout: {
      totalWithStatus: therapyTotal,
      neverCame,
      voluntaryDischarge,
      rate: therapyTotal ? Number(((dropoutCount / therapyTotal) * 100).toFixed(1)) : 0,
    },
    totals: { newPatients: rangePatients.length },
  };
}

export interface PsychologistReportRow {
  name: string;
  speciality: string;
  workType: string;
  /** Nombres de pacientes con asignación activa. */
  activePatients: string[];
  /** Pacientes distintos con al menos una cita agendada dentro del rango. */
  patientsInRange: number;
  /** Mismo conteo que patientsInRange, desglosado por tipo de servicio de la cita. */
  patientsByServiceType: Record<AppointmentServiceType, number>;
  /** Citas dentro del rango, por estado (excluye solicitudes pendientes/rechazadas). */
  appointments: {
    total: number;
    attended: number;
    noShow: number;
    cancelled: number;
    scheduled: number;
    rescheduled: number;
  };
  /** Horas reales de citas asistidas dentro del rango (suma de duración, en minutos, / 60). */
  hoursOfAttention: number;
  /** Mismo cálculo que hoursOfAttention, desglosado por tipo de servicio de la cita. */
  hoursByServiceType: Record<AppointmentServiceType, number>;
  weeksReported: number;
}

/**
 * Per-psychologist indicators for a date range: active patients, appointments
 * by status, and hours from attended appointments.
 * @param start inclusive
 * @param end exclusive
 */
export async function buildPsychologistReport(
  start: Date,
  end: Date,
): Promise<PsychologistReportRow[]> {
  const psychologists = await db.psychologist.findMany({
    where: { isActive: true },
    select: {
      speciality: true,
      workType: true,
      user: { select: { name: true } },
      assignments: {
        where: { isActive: true },
        select: { patient: { select: { fullName: true } } },
        orderBy: { patient: { fullName: "asc" } },
      },
      appointments: {
        where: { scheduledAt: { gte: start, lt: end } },
        select: { status: true, patientId: true, duration: true, serviceType: true },
      },
      weeklyReports: {
        where: { weekStartDate: { gte: start, lt: end } },
        select: { id: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return psychologists.map((p) => {
    const byStatus = { attended: 0, noShow: 0, cancelled: 0, scheduled: 0, rescheduled: 0 };
    let attendedMinutes = 0;
    const patientIdsByType: Record<AppointmentServiceType, Set<string>> = {
      THERAPY: new Set(),
      EXPLORATION_SESSION: new Set(),
      EVALUATION: new Set(),
    };
    const attendedMinutesByType: Record<AppointmentServiceType, number> = {
      THERAPY: 0,
      EXPLORATION_SESSION: 0,
      EVALUATION: 0,
    };
    for (const a of p.appointments) {
      patientIdsByType[a.serviceType].add(a.patientId);
      if (a.status === AppointmentStatus.ATTENDED) {
        byStatus.attended++;
        attendedMinutes += a.duration;
        attendedMinutesByType[a.serviceType] += a.duration;
      } else if (a.status === AppointmentStatus.NO_SHOW) byStatus.noShow++;
      else if (a.status === AppointmentStatus.CANCELLED) byStatus.cancelled++;
      else if (a.status === AppointmentStatus.SCHEDULED) byStatus.scheduled++;
      else if (a.status === AppointmentStatus.RESCHEDULED) byStatus.rescheduled++;
      // PENDING / REJECTED son solicitudes, no citas reales.
    }
    return {
      name: p.user.name,
      speciality: specialityLabels[p.speciality],
      workType: workTypeLabels[p.workType],
      activePatients: p.assignments.map((a) => a.patient.fullName),
      patientsInRange: new Set(p.appointments.map((a) => a.patientId)).size,
      patientsByServiceType: {
        THERAPY: patientIdsByType.THERAPY.size,
        EXPLORATION_SESSION: patientIdsByType.EXPLORATION_SESSION.size,
        EVALUATION: patientIdsByType.EVALUATION.size,
      },
      appointments: {
        total:
          byStatus.attended + byStatus.noShow + byStatus.cancelled +
          byStatus.scheduled + byStatus.rescheduled,
        ...byStatus,
      },
      hoursOfAttention: round1(attendedMinutes / 60),
      hoursByServiceType: {
        THERAPY: round1(attendedMinutesByType.THERAPY / 60),
        EXPLORATION_SESSION: round1(attendedMinutesByType.EXPLORATION_SESSION / 60),
        EVALUATION: round1(attendedMinutesByType.EVALUATION / 60),
      },
      weeksReported: p.weeklyReports.length,
    };
  });
}

export { serviceAreaLabels, ServiceArea };
