import { type NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/siere/[id]/approve — coordinator/admin approves a SIERE request.
 * Note: the dynamic segment here is the application id (not patientId); Next
 * disambiguates by the static `approve` child segment.
 */
export async function PUT(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  if (user.role !== Role.ADMIN && user.role !== Role.COORDINATOR) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }

  const existing = await db.siereApplication.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }
  if (existing.approvedById) {
    return Response.json({ error: "Ya estaba aprobada" }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.siereApplication.update({
      where: { id },
      data: { approvedById: user.id, approvedAt: new Date() },
    });
    await recordAudit(
      {
        userId: user.id,
        entityType: "SiereApplication",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: { approved: true },
      },
      tx,
    );
    return result;
  });

  return Response.json(updated);
}
