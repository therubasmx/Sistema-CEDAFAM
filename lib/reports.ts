import {
  ServiceArea,
  TherapyStatus,
  EvaluationStatus,
  ServiceType,
  PatientType,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  serviceAreaLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
  patientTypeLabels,
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
  NEUROPSYCHOLOGICAL: number;
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
  patientsByPsychEvaluationStatus: CountRow[];
  patientsByNeuroEvaluationStatus: CountRow[];
  patientsByType: CountRow[];
  topReasons: CountRow[];
  averageDuration: { therapyMonths: number; evaluationWeeks: number };
  dropout: { totalWithStatus: number; neverCame: number; voluntaryDischarge: number; rate: number };
  totals: { newPatients: number };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** Builds all five annual reports for the given year. */
export async function buildAnnualReport(year: number): Promise<AnnualReport> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const [yearPatients, allStatuses, firstPatient, typeGroups] = await Promise.all([
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
        patient: { select: { createdAt: true, serviceArea: true } },
      },
      orderBy: { changedAt: "asc" },
    }),
    db.patient.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    // Distribución actual de pacientes por tipo de px (snapshot, como los estados).
    db.patient.groupBy({
      by: ["patientType"],
      where: { patientType: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // 1) New patients per month, split by service area.
  const months: MonthRow[] = MONTHS_ES.map((m) => ({
    month: m,
    PSYCHOLOGY: 0,
    PSYCHIATRY: 0,
    PSYCHOLOGICAL_EVALUATION: 0,
    NEUROPSYCHOLOGICAL: 0,
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
  const psychEvalCounts = new Map<EvaluationStatus, number>();
  const neuroEvalCounts = new Map<EvaluationStatus, number>();
  for (const s of latestByPatient.values()) {
    if (s.therapyStatus) {
      therapyCounts.set(s.therapyStatus, (therapyCounts.get(s.therapyStatus) ?? 0) + 1);
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

  // 2b) Patients by type (tipo de px) — current snapshot.
  const typeCounts = new Map<PatientType, number>();
  for (const g of typeGroups) {
    if (g.patientType) typeCounts.set(g.patientType, g._count._all);
  }
  const patientsByType: CountRow[] = Object.values(PatientType).map((k) => ({
    key: k,
    label: patientTypeLabels[k],
    count: typeCounts.get(k) ?? 0,
  }));

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

  // 5) Dropout rate: (NEVER_CAME + VOLUNTARY_DISCHARGE) over patients with any therapy status.
  const therapyTotal = [...therapyCounts.values()].reduce((a, b) => a + b, 0);
  const neverCame = therapyCounts.get(TherapyStatus.NEVER_CAME) ?? 0;
  const voluntaryDischarge = therapyCounts.get(TherapyStatus.VOLUNTARY_DISCHARGE) ?? 0;
  const dropoutCount = neverCame + voluntaryDischarge;

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
    patientsByPsychEvaluationStatus,
    patientsByNeuroEvaluationStatus,
    patientsByType,
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
    totals: { newPatients: yearPatients.length },
  };
}

export { serviceAreaLabels, ServiceArea };
