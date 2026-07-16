import Link from "next/link";
import { AppointmentStatus, Role, type Speciality } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMxDay, endOfMxDay } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PendingPatientsPanel } from "@/components/dashboard/pending-patients-panel";
import {
  TodaySchedulePanel,
  type TodayScheduleEntry,
} from "@/components/dashboard/today-schedule-panel";
import {
  RecentAssignmentsPanel,
  type RecentAssignmentEntry,
} from "@/components/dashboard/recent-assignments-panel";
import {
  CapacityPanel,
  WORKTYPE_CAPACITY,
  type CapacityEntry,
} from "@/components/dashboard/capacity-panel";
import {
  SpecialityAvailabilityPanel,
  type SpecialityAvailabilityEntry,
} from "@/components/dashboard/speciality-availability-panel";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { SendAnnouncementButton } from "@/components/notifications/send-announcement-button";
import { roleLabels } from "@/lib/labels";

/** Human-readable wait duration in Spanish (min / h / d). */
function formatWait(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `${hrs} h`;
  return `${Math.round(hrs / 24)} d`;
}

function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number | string;
  href?: string;
}) {
  const body = (
    <Card className={href ? "transition-colors hover:bg-accent" : undefined}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardHome() {
  const session = await auth();
  const user = session!.user;
  const role = user.role;

  // Build role-specific stats.
  if (role === Role.PSYCHOLOGIST) {
    const psychologistId = user.psychologistId ?? "";
    const [activePatients, exploratory] = await Promise.all([
      db.patientAssignment.count({
        where: { psychologistId, isActive: true, isExploratorySession: false },
      }),
      db.patientAssignment.count({
        where: { psychologistId, isActive: true, isExploratorySession: true },
      }),
    ]);
    return (
      <Welcome name={user.name} role={role}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Mis pacientes activos"
            value={activePatients}
            href="/dashboard/patients"
          />
          <StatCard title="Sesiones de exploración" value={exploratory} />
        </div>
      </Welcome>
    );
  }

  // Admin / Coordinator / Accountant — global view.
  const now = new Date();
  const [
    totalPatients,
    unassigned,
    activeAssignments,
    psychologists,
    todaysAppointments,
    recentAssignments,
    psychologistList,
  ] = await Promise.all([
    db.patient.count(),
    db.patient.count({ where: { assignments: { none: { isActive: true } } } }),
    db.patientAssignment.count({ where: { isActive: true } }),
    db.psychologist.count({ where: { isActive: true } }),
    db.appointment.findMany({
      where: {
        scheduledAt: { gte: startOfMxDay(now), lte: endOfMxDay(now) },
        status: AppointmentStatus.SCHEDULED,
        psychologist: { isActive: true },
      },
      orderBy: { scheduledAt: "asc" },
      include: {
        patient: { select: { fullName: true } },
        psychologist: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
    db.patientAssignment.findMany({
      orderBy: { assignedAt: "desc" },
      take: 50,
      include: {
        patient: { select: { fullName: true, createdAt: true } },
        psychologist: { select: { user: { select: { name: true } } } },
      },
    }),
    db.psychologist.findMany({
      where: { isActive: true },
      include: {
        user: { select: { name: true } },
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  // Group today's appointments by psychologist (already time-sorted).
  const scheduleMap = new Map<string, TodayScheduleEntry>();
  for (const a of todaysAppointments) {
    const pid = a.psychologist.id;
    let entry = scheduleMap.get(pid);
    if (!entry) {
      entry = {
        psychologistId: pid,
        name: a.psychologist.user.name ?? "Sin nombre",
        appointments: [],
      };
      scheduleMap.set(pid, entry);
    }
    entry.appointments.push({
      id: a.id,
      scheduledAt: a.scheduledAt.toISOString(),
      patientName: a.patient.fullName,
    });
  }
  const todaySchedule = Array.from(scheduleMap.values());

  // Business metrics.
  const assignedPatients = totalPatients - unassigned;
  const conversionPct =
    totalPatients > 0 ? Math.round((assignedPatients / totalPatients) * 100) : 0;
  const availableToday = Math.max(0, psychologists - todaySchedule.length);

  // Average time-to-assignment over the recent sample (positive diffs only).
  const waitSamples = recentAssignments
    .map((a) => a.assignedAt.getTime() - a.patient.createdAt.getTime())
    .filter((ms) => ms > 0);
  const avgWait =
    waitSamples.length > 0
      ? formatWait(waitSamples.reduce((s, ms) => s + ms, 0) / waitSamples.length)
      : "—";

  const recentFeed: RecentAssignmentEntry[] = recentAssignments
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      patientName: a.patient.fullName,
      psychologistName: a.psychologist.user.name ?? "Sin nombre",
      assignedAt: a.assignedAt.toISOString(),
      isExploratorySession: a.isExploratorySession,
    }));

  const capacityData: CapacityEntry[] = psychologistList.map((p) => ({
    id: p.id,
    name: p.user.name ?? "Sin nombre",
    workType: p.workType,
    active: p._count.assignments,
    capacity: WORKTYPE_CAPACITY[p.workType],
  }));

  // Aggregate free capacity by speciality.
  const specialityMap = new Map<Speciality, { count: number; freeSlots: number }>();
  for (const p of psychologistList) {
    const free = Math.max(0, WORKTYPE_CAPACITY[p.workType] - p._count.assignments);
    const g = specialityMap.get(p.speciality) ?? { count: 0, freeSlots: 0 };
    g.count += 1;
    g.freeSlots += free;
    specialityMap.set(p.speciality, g);
  }
  const specialityData: SpecialityAvailabilityEntry[] = Array.from(
    specialityMap,
    ([speciality, v]) => ({ speciality, count: v.count, freeSlots: v.freeSlots }),
  );

  const canAssign = role === Role.ADMIN || role === Role.COORDINATOR;

  return (
    <Welcome name={user.name} role={role}>
      <div className="flex items-center justify-between gap-4">
        <QuickSearch />
        <SendAnnouncementButton role={role} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pacientes totales"
          value={totalPatients}
          href="/dashboard/patients"
        />
        <StatCard
          title="Sin asignar"
          value={unassigned}
          href={canAssign ? "/dashboard/assignments" : "/dashboard/patients"}
        />
        <StatCard title="Asignaciones activas" value={activeAssignments} />
        <StatCard title="Psicólogos activos" value={psychologists} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Conversión (asignados)" value={`${conversionPct}%`} />
        <StatCard title="Tiempo prom. asignación" value={avgWait} />
        <StatCard title="Psicólogos libres hoy" value={availableToday} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PendingPatientsPanel canAssign={canAssign} />
        <TodaySchedulePanel data={todaySchedule} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CapacityPanel data={capacityData} />
        <SpecialityAvailabilityPanel data={specialityData} />
      </div>

      <RecentAssignmentsPanel data={recentFeed} />
    </Welcome>
  );
}

function Welcome({
  name,
  role,
  children,
}: {
  name?: string | null;
  role: Role;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {name ?? "Usuario"}</h1>
        <p className="text-muted-foreground">{roleLabels[role]}</p>
      </div>
      {children}
    </div>
  );
}
