import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  serviceAreaLabels,
  referenceTypeLabels,
  patientTypeLabels,
  timeSlotLabels,
  serviceTypeLabels,
  therapyStatusLabels,
  evaluationStatusLabels,
  appointmentStatusLabels,
  appointmentServiceTypeLabels,
} from "@/lib/labels";
import { PatientStatusModule } from "@/components/patients/patient-status-module";

type Params = { params: Promise<{ id: string }> };

export default async function PatientDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await auth();
  const user = session!.user;

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      assignments: {
        where: { isActive: true },
        include: { psychologist: { include: { user: { select: { name: true } } } } },
      },
      statuses: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
      },
      appointments: {
        include: { psychologist: { include: { user: { select: { name: true } } } } },
        orderBy: { scheduledAt: "desc" },
      },
    },
  });

  if (!patient) notFound();

  // Scope: psychologists only see their own patients.
  if (user.role === Role.PSYCHOLOGIST) {
    const mine = patient.assignments.some(
      (a) => a.psychologistId === user.psychologistId,
    );
    if (!mine) redirect("/dashboard/patients");
  }

  const assignment = patient.assignments[0];

  const canManageStatus =
    user.role === Role.ADMIN ||
    user.role === Role.COORDINATOR ||
    user.role === Role.ACCOUNTANT;

  const canAssign = user.role === Role.ADMIN || user.role === Role.COORDINATOR;

  const canEditPatient = can(user.role, "patients:update");

  const latestStatus = patient.statuses[0] ?? null;

  const currentStatusData = latestStatus
    ? {
        serviceType: latestStatus.serviceType,
        therapyStatus: latestStatus.therapyStatus,
        evaluationStatus: latestStatus.evaluationStatus,
      }
    : null;

  const currentAssignmentData = assignment
    ? {
        psychologistId: assignment.psychologistId,
        psychologistName: assignment.psychologist.user.name,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{patient.fullName}</h1>
          <p className="text-muted-foreground">
            {patient.age} años · {serviceAreaLabels[patient.serviceArea]}
          </p>
        </div>
        {canEditPatient && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/patients/${patient.id}/edit`}>Editar</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Datos del paciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Expediente" value={patient.fileNumber ?? "—"} />
            <Field label="Teléfono" value={patient.phoneNumber} />
            <Field label="Correo" value={patient.email ?? "—"} />
            <Field label="CURP" value={patient.curp ?? "—"} />
            <Field label="Código postal" value={patient.postalCode ?? "—"} />
            <Field label="Dirección" value={patient.address ?? "—"} />
            <Field
              label="Horario preferido"
              value={timeSlotLabels[patient.preferredTimeSlot]}
            />
            <Field
              label="Referencia"
              value={referenceTypeLabels[patient.referenceType]}
            />
            <Field
              label="Tipo de px"
              value={
                patient.patientType
                  ? patientTypeLabels[patient.patientType]
                  : "—"
              }
            />
            {!canManageStatus && (
              <Field
                label="Psicólogo asignado"
                value={assignment?.psychologist.user.name ?? "Sin asignar"}
              />
            )}
            <div>
              <p className="font-medium text-muted-foreground">Motivo de consulta</p>
              <p>{patient.consultationReason}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {canManageStatus && (
            <PatientStatusModule
              patientId={patient.id}
              patientName={patient.fullName}
              initialStatus={currentStatusData}
              initialAssignment={currentAssignmentData}
              canAssign={canAssign}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle>Historial de estados</CardTitle>
            </CardHeader>
            <CardContent>
              {patient.statuses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin registros.</p>
              ) : (
                <ul className="space-y-3">
                  {patient.statuses.map((s) => {
                    const label = s.therapyStatus
                      ? therapyStatusLabels[s.therapyStatus]
                      : s.evaluationStatus
                        ? evaluationStatusLabels[s.evaluationStatus]
                        : "—";
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
                      >
                        <Badge variant="secondary">
                          {serviceTypeLabels[s.serviceType]}
                        </Badge>
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">
                          {format(s.changedAt, "d MMM yyyy HH:mm", { locale: es })}
                          {" · "}
                          {s.changedBy.name}
                        </span>
                        {s.notes && (
                          <span className="w-full text-muted-foreground">
                            {s.notes}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Citas</CardTitle>
            </CardHeader>
            <CardContent>
              {patient.appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin citas registradas.</p>
              ) : (
                <ul className="space-y-2">
                  {patient.appointments.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0"
                    >
                      <span className="font-medium">
                        {format(a.scheduledAt, "d MMM yyyy HH:mm", { locale: es })}
                      </span>
                      <Badge variant="outline">
                        {appointmentServiceTypeLabels[a.serviceType]}
                      </Badge>
                      <Badge variant="secondary">
                        {appointmentStatusLabels[a.status]}
                      </Badge>
                      <span className="text-muted-foreground">
                        {a.psychologist.user.name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
