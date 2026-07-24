import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMxDate, formatMxDateTime } from "@/lib/utils";
import { isEvaluationServiceArea } from "@/lib/evaluations";
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
  appointmentStatusLabels,
  appointmentServiceTypeLabels,
} from "@/lib/labels";
import { PatientStatusModule } from "@/components/patients/patient-status-module";
import { StatusHistoryList } from "@/components/patients/status-history-list";
import { AssignmentHistoryList } from "@/components/patients/assignment-history-list";
import { DeletePatientButton } from "@/components/patients/delete-patient-button";
import { EvaluationFolioDialog } from "@/components/patients/evaluation-folio-dialog";

type Params = { params: Promise<{ id: string }> };

export default async function PatientDetailPage({ params }: Params) {
  const { id } = await params;
  const session = await auth();
  const user = session!.user;

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      assignments: {
        include: {
          psychologist: { include: { user: { select: { name: true } } } },
          assignedBy: { select: { name: true } },
        },
        orderBy: { assignedAt: "desc" },
      },
      statuses: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
      },
      appointments: {
        include: { psychologist: { include: { user: { select: { name: true } } } } },
        orderBy: { scheduledAt: "desc" },
      },
      evaluationFolios: { orderBy: { folio: "desc" } },
    },
  });

  if (!patient) notFound();

  // Scope: psychologists only see their own patients (current assignment).
  if (user.role === Role.PSYCHOLOGIST) {
    const mine = patient.assignments.some(
      (a) => a.isActive && a.psychologistId === user.psychologistId,
    );
    if (!mine) redirect("/dashboard/patients");
  }

  const assignment = patient.assignments.find((a) => a.isActive);

  const canManageStatus =
    user.role === Role.ADMIN ||
    user.role === Role.COORDINATOR ||
    user.role === Role.ACCOUNTANT;

  const canAssign = user.role === Role.ADMIN || user.role === Role.COORDINATOR;

  const canEditPatient = can(user.role, "patients:update");

  const canDeletePatient = can(user.role, "patients:delete");

  const canManageStatusHistory = can(user.role, "patients:statusManage");

  const canManageAssignmentHistory = can(user.role, "assignments:manage");

  // El folio de evaluación solo existe para pacientes de Evaluación
  // Psicológica o Neuropsicológica, y lo abre quien evalúa. El botón maneja el
  // folio vigente; los del registro en papel se listan aparte porque no se
  // capturan desde aquí.
  const folio = patient.evaluationFolios.find((f) => !f.isHistorical) ?? null;
  const historicalFolios = patient.evaluationFolios.filter((f) => f.isHistorical);
  const showFolioButton =
    isEvaluationServiceArea(patient.serviceArea) &&
    (folio ? true : can(user.role, "evaluations:create"));
  // El psicólogo solo corrige el folio que él mismo generó; cada folio
  // histórico puede tener un evaluador distinto (o ninguno).
  const canEditFolioRecord = (f: { evaluatorId: string | null }) =>
    can(user.role, "evaluations:update") &&
    (user.role !== Role.PSYCHOLOGIST || f.evaluatorId === user.id);
  const canEditFolio = canEditFolioRecord(folio ?? { evaluatorId: null });

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

  const assignmentHistoryItems = patient.assignments.map((a) => ({
    id: a.id,
    psychologistId: a.psychologistId,
    psychologistName: a.psychologist.user.name,
    assignedAt: a.assignedAt,
    assignedByName: a.assignedBy.name,
    isExploratorySession: a.isExploratorySession,
    isActive: a.isActive,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{patient.fullName}</h1>
          <p className="text-muted-foreground">
            {patient.age} años · {serviceAreaLabels[patient.serviceArea]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showFolioButton && (
            <EvaluationFolioDialog
              patientId={patient.id}
              patientName={patient.fullName}
              folio={
                folio
                  ? {
                      id: folio.id,
                      folio: folio.folio,
                      isHistorical: folio.isHistorical,
                      diagnosis: folio.diagnosis ?? "",
                      firstInterviewAt: folio.firstInterviewAt?.toISOString() ?? null,
                      resultsDeliveryAt: folio.resultsDeliveryAt?.toISOString() ?? null,
                      evaluationDateText: folio.evaluationDateText,
                      reportLink: folio.reportLink,
                      evaluatorName: folio.evaluatorName,
                    }
                  : null
              }
              canEdit={canEditFolio}
            />
          )}
          {canEditPatient && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/patients/${patient.id}/edit`}>Editar</Link>
            </Button>
          )}
          {canDeletePatient && (
            <DeletePatientButton
              patientId={patient.id}
              patientName={patient.fullName}
              hasLinkedData={
                patient.appointments.length > 0 ||
                patient.assignments.length > 0 ||
                patient.statuses.length > 0
              }
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Datos del paciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field
              label="Fecha de nacimiento"
              value={
                patient.dateOfBirth
                  ? format(patient.dateOfBirth, "d 'de' MMMM 'de' yyyy", { locale: es })
                  : "—"
              }
            />
            <Field label="Teléfono" value={patient.phoneNumber} />
            <Field label="Correo" value={patient.email ?? "—"} />
            <Field label="Expediente hospital" value={patient.fileNumber ?? "—"} />
            <Field label="Folio CEDAFAM" value={patient.cedafamFolio ?? "—"} />
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
            {folio && (
              <>
                <Field label="Folio de evaluación" value={String(folio.folio)} />
                {folio.firstInterviewAt && folio.resultsDeliveryAt && (
                  <Field
                    label="Fecha de evaluación"
                    value={`${formatMxDate(folio.firstInterviewAt)} – ${formatMxDate(
                      folio.resultsDeliveryAt,
                    )}`}
                  />
                )}
              </>
            )}
            {historicalFolios.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Folios anteriores</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {historicalFolios.map((f) => (
                    <EvaluationFolioDialog
                      key={f.id}
                      compact
                      patientId={patient.id}
                      patientName={patient.fullName}
                      folio={{
                        id: f.id,
                        folio: f.folio,
                        isHistorical: f.isHistorical,
                        diagnosis: f.diagnosis ?? "",
                        firstInterviewAt: f.firstInterviewAt?.toISOString() ?? null,
                        resultsDeliveryAt: f.resultsDeliveryAt?.toISOString() ?? null,
                        evaluationDateText: f.evaluationDateText,
                        reportLink: f.reportLink,
                        evaluatorName: f.evaluatorName,
                      }}
                      canEdit={canEditFolioRecord(f)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="font-medium text-muted-foreground">Motivo de consulta</p>
              <p>{patient.consultationReason}</p>
            </div>
            {folio?.diagnosis && (
              <div>
                <p className="font-medium text-muted-foreground">Diagnóstico</p>
                <p className="whitespace-pre-wrap">{folio.diagnosis}</p>
              </div>
            )}
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
              <CardTitle>Historial de psicólogo asignado</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentHistoryList
                patientId={patient.id}
                initialItems={assignmentHistoryItems}
                canManage={canManageAssignmentHistory}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Historial de estados</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusHistoryList
                patientId={patient.id}
                initialItems={patient.statuses}
                canManage={canManageStatusHistory}
              />
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
                        {formatMxDateTime(a.scheduledAt)}
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
