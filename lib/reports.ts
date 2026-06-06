import {
  ServiceArea,
  TherapyStatus,
  EvaluationStatus,
  ServiceType,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  serviceAreaLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
} from "@/lib/labels";

const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export interface MonthRow {
  month: string;
  PSYCHOLOGY: number;
  PSYCHIATRY: number;
  PSYCHOLOGICAL_EVALUATION: number;
  total: number;
}

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface AnnualReport {
  year: number;
  availableYears: number[];
  newPatientsByMonth: MonthRow[];
  patientsByTherapyStatus: CountRow[];
  patientsByEvaluationStatus: CountRow[];
  topReasons: CountRow[];
  averageDuration: { therapyMonths: number; evaluationWeeks: number };
  dropout: { totalWithStatus: number; neverCame: number; rate: number };
  totals: { newPatients: number };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** Builds all five annual reports for the given year. */
export async function buildAnnualReport(year: number): Promise<AnnualReport> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const [yearPatients, allStatuses, firstPatient] = await Promise.all([
    db.patient.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { createdAt: true, serviceArea: true, consultationReason: true },
    }),
    db.patientStatus.findMany({
      select: {
        patientId: true,
        serviceType: true,
        therapyStatus: true,
        evaluationStatus: true,
        changedAt: true,
        patient: { select: { createdAt: true } },
      },
      orderBy: { changedAt: "asc" },
    }),
    db.patient.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  // 1) New patients per month, split by service area.
  const months: MonthRow[] = MONTHS_ES.map((m) => ({
    month: m,
    PSYCHOLOGY: 0,
    PSYCHIATRY: 0,
    PSYCHOLOGICAL_EVALUATION: 0,
    total: 0,
  }));
  for (const p of yearPatients) {
    const row = months[p.createdAt.getMonth()];
    row[p.serviceArea]++;
    row.total++;
  }

  // 2) Patients by current status — snapshot from latest status per patient.
  const latestByPatient = new Map<
    string,
    (typeof allStatuses)[number]
  >();
  for (const s of allStatuses) latestByPatient.set(s.patientId, s); // asc order → last wins

  const therapyCounts = new Map<TherapyStatus, number>();
  const evalCounts = new Map<EvaluationStatus, number>();
  for (const s of latestByPatient.values()) {
    if (s.therapyStatus) {
      therapyCounts.set(s.therapyStatus, (therapyCounts.get(s.therapyStatus) ?? 0) + 1);
    }
    if (s.evaluationStatus) {
      evalCounts.set(s.evaluationStatus, (evalCounts.get(s.evaluationStatus) ?? 0) + 1);
    }
  }

  const patientsByTherapyStatus: CountRow[] = Object.values(TherapyStatus).map((k) => ({
    key: k,
    label: therapyStatusLabels[k],
    count: therapyCounts.get(k) ?? 0,
  }));
  const patientsByEvaluationStatus: CountRow[] = Object.values(EvaluationStatus).map(
    (k) => ({
      key: k,
      label: evaluationStatusLabels[k],
      count: evalCounts.get(k) ?? 0,
    }),
  );

  // 3) Top 10 consultation reasons (normalized by lowercase).
  const reasonCounts = new Map<string, { label: string; count: number }>();
  for (const p of yearPatients) {
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

  // 4) Average duration: therapy in months, evaluation in weeks.
  let therapySum = 0;
  let therapyN = 0;
  let evalSum = 0;
  let evalN = 0;
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
    if (
      s.serviceType === ServiceType.EVALUATION &&
      s.evaluationStatus === EvaluationStatus.EVALUATION_COMPLETED
    ) {
      evalSum += span / MS_PER_WEEK;
      evalN++;
    }
  }

  // 5) Dropout rate: NEVER_CAME over patients that have any therapy status.
  const therapyTotal = [...therapyCounts.values()].reduce((a, b) => a + b, 0);
  const neverCame = therapyCounts.get(TherapyStatus.NEVER_CAME) ?? 0;

  // Available years for the selector.
  const firstYear = firstPatient?.createdAt.getFullYear() ?? year;
  const thisYear = new Date().getFullYear();
  const availableYears: number[] = [];
  for (let y = thisYear; y >= firstYear; y--) availableYears.push(y);

  return {
    year,
    availableYears,
    newPatientsByMonth: months,
    patientsByTherapyStatus,
    patientsByEvaluationStatus,
    topReasons,
    averageDuration: {
      therapyMonths: therapyN ? Number((therapySum / therapyN).toFixed(1)) : 0,
      evaluationWeeks: evalN ? Number((evalSum / evalN).toFixed(1)) : 0,
    },
    dropout: {
      totalWithStatus: therapyTotal,
      neverCame,
      rate: therapyTotal ? Number(((neverCame / therapyTotal) * 100).toFixed(1)) : 0,
    },
    totals: { newPatients: yearPatients.length },
  };
}

export { serviceAreaLabels, ServiceArea };
