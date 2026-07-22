import { type NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { evaluationFolioCreateSchema } from "@/lib/validators";
import {
  evaluationFolioInclude,
  isEvaluationServiceArea,
  nextEvaluationFolio,
} from "@/lib/evaluations";
import { recordAudit, AuditAction } from "@/lib/audit";

/**
 * GET /api/evaluations — folios emitidos, del más reciente al más antiguo.
 *
 * El listado completo es del módulo de la Contadora (y de jefatura). Quien no
 * lo tenga ve únicamente los folios que generó, para poder consultar lo que
 * escribió.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  const where: Prisma.EvaluationFolioWhereInput = can(user.role, "evaluations:read")
    ? {}
    : { evaluatorId: user.id };

  const folios = await db.evaluationFolio.findMany({
    where,
    orderBy: { folio: "desc" },
    include: evaluationFolioInclude,
  });

  return Response.json(folios);
}

/**
 * POST /api/evaluations — el evaluador abre el folio de un paciente.
 *
 * El número de folio es un consecutivo que continúa el que el centro llevaba
 * en papel. Se calcula aquí (no en la base) y se reintenta si dos personas lo
 * generan a la vez: el índice único sobre `folio` es lo que decide.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("evaluations:create");
  if (guard instanceof Response) return guard;
  const user = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = evaluationFolioCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const patient = await db.patient.findUnique({
    where: { id: data.patientId },
    include: { assignments: { where: { isActive: true } } },
  });
  if (!patient) {
    return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  // El folio es de evaluación: un paciente de terapia o psiquiatría no lleva.
  if (!isEvaluationServiceArea(patient.serviceArea)) {
    return Response.json(
      { error: "Este paciente no está en evaluación" },
      { status: 400 },
    );
  }

  // Un psicólogo solo folia a los pacientes que tiene asignados, igual que en
  // el resto del sistema.
  if (user.role === Role.PSYCHOLOGIST) {
    const isMine = patient.assignments.some(
      (a) => a.psychologistId === user.psychologistId,
    );
    if (!isMine) {
      return Response.json({ error: "Permiso denegado" }, { status: 403 });
    }
  }

  // Un folio nuevo por paciente. Los históricos no cuentan: un paciente que
  // arrastra folios del registro en papel sí puede recibir uno nuevo si se
  // vuelve a evaluar.
  const existing = await db.evaluationFolio.findFirst({
    where: { patientId: patient.id, isHistorical: false },
  });
  if (existing) {
    return Response.json(
      { error: "Este paciente ya tiene un folio de evaluación" },
      { status: 409 },
    );
  }

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const last = await db.evaluationFolio.findFirst({
      orderBy: { folio: "desc" },
      select: { folio: true },
    });

    try {
      const created = await db.$transaction(async (tx) => {
        const folio = await tx.evaluationFolio.create({
          data: {
            folio: nextEvaluationFolio(last?.folio ?? null),
            patientId: patient.id,
            evaluatorId: user.id,
            // Copia en texto, para que la lista pinte igual los folios nuevos
            // y los del registro en papel.
            patientName: patient.fullName,
            fileNumber: patient.fileNumber,
            evaluatorName: user.name ?? "Sin evaluador",
            diagnosis: data.diagnosis,
            firstInterviewAt: data.firstInterviewAt,
            resultsDeliveryAt: data.resultsDeliveryAt,
          },
          include: evaluationFolioInclude,
        });

        await recordAudit(
          {
            userId: user.id,
            entityType: "EvaluationFolio",
            entityId: folio.id,
            action: AuditAction.CREATE,
            changedFields: {
              folio: folio.folio,
              patientId: patient.id,
              diagnosis: folio.diagnosis,
            },
          },
          tx,
        );

        return folio;
      });

      return Response.json(created, { status: 201 });
    } catch (err) {
      const isDuplicate =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      // Choque de folio con otro evaluador que guardó primero: se recalcula el
      // consecutivo. Si el choque fue por `patientId`, alguien creó el folio de
      // este paciente entre la comprobación de arriba y el insert.
      if (!isDuplicate) throw err;
      const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
      const onPatient = Array.isArray(target)
        ? target.includes("patientId")
        : String(target ?? "").includes("patientId");
      if (onPatient) {
        return Response.json(
          { error: "Este paciente ya tiene un folio de evaluación" },
          { status: 409 },
        );
      }
    }
  }

  return Response.json(
    { error: "No se pudo generar el folio, intenta de nuevo" },
    { status: 503 },
  );
}
