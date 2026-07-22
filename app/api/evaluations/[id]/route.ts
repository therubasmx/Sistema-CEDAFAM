import { type NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { evaluationFolioUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";
import { evaluationFolioInclude } from "@/lib/evaluations";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/evaluations/[id] — corrige un folio y le agrega el link del informe.
 *
 * La Contadora (y jefatura/coordinación) editan cualquier folio; un psicólogo
 * solo el que él mismo generó.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("evaluations:update");
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = evaluationFolioUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const existing = await db.evaluationFolio.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Folio no encontrado" }, { status: 404 });
  }

  if (user.role === Role.PSYCHOLOGIST && existing.evaluatorId !== user.id) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  // Nombre, expediente, evaluador y fecha literal son del registro en papel.
  // En un folio nuevo esos datos salen del paciente y del usuario ligados, y
  // dejarlos editar aquí los desincronizaría en silencio.
  const textFields = [
    "patientName",
    "fileNumber",
    "evaluatorName",
    "evaluationDateText",
  ] as const;
  if (!existing.isHistorical && textFields.some((f) => data[f] !== undefined)) {
    return Response.json(
      {
        error:
          "En un folio nuevo el paciente y el evaluador se toman del expediente, no se capturan",
      },
      { status: 400 },
    );
  }

  // El rango se valida contra lo que quedará guardado: mandar una sola de las
  // dos fechas no puede dejar la entrega antes de la primera entrevista.
  const firstInterviewAt =
    data.firstInterviewAt === undefined ? existing.firstInterviewAt : data.firstInterviewAt;
  const resultsDeliveryAt =
    data.resultsDeliveryAt === undefined
      ? existing.resultsDeliveryAt
      : data.resultsDeliveryAt;
  if (firstInterviewAt && resultsDeliveryAt && resultsDeliveryAt < firstInterviewAt) {
    return Response.json(
      {
        error:
          "La entrega de resultados no puede ser anterior a la primera entrevista",
      },
      { status: 400 },
    );
  }
  // Un folio nuevo no puede quedarse sin sus fechas.
  if (!existing.isHistorical && (!firstInterviewAt || !resultsDeliveryAt)) {
    return Response.json(
      { error: "Indica las dos fechas de la evaluación" },
      { status: 400 },
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const folio = await tx.evaluationFolio.update({
      where: { id },
      data: {
        diagnosis: data.diagnosis,
        firstInterviewAt,
        resultsDeliveryAt,
        ...(data.patientName === undefined ? {} : { patientName: data.patientName }),
        ...(data.fileNumber === undefined
          ? {}
          : { fileNumber: data.fileNumber || null }),
        ...(data.evaluatorName === undefined
          ? {}
          : { evaluatorName: data.evaluatorName }),
        ...(data.evaluationDateText === undefined
          ? {}
          : { evaluationDateText: data.evaluationDateText || null }),
        ...(data.reportLink === undefined
          ? {}
          : { reportLink: data.reportLink || null }),
      },
      include: evaluationFolioInclude,
    });

    await recordAudit(
      {
        userId: user.id,
        entityType: "EvaluationFolio",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: data as Prisma.InputJsonValue,
      },
      tx,
    );

    return folio;
  });

  return Response.json(updated);
}
