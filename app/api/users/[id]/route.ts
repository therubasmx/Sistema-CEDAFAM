import { type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { userUpdateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/users/[id] — update a user (name, role, active state, password).
 * Keeps the linked psychologist's isActive flag in sync. Admins can't
 * deactivate themselves.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("users:manage");
  if (guard instanceof Response) return guard;
  const admin = guard;
  const { id } = await params;

  const existing = await db.user.findUnique({
    where: { id },
    include: { psychologist: true },
  });
  if (!existing) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (id === admin.id && data.isActive === false) {
    return Response.json(
      { error: "No puedes desactivar tu propia cuenta" },
      { status: 400 },
    );
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        ...(data.password ? { password: await bcrypt.hash(data.password, 10) } : {}),
      },
    });

    // Mirror the active state onto the psychologist profile, if any.
    if (existing.psychologist && data.isActive !== undefined) {
      await tx.psychologist.update({
        where: { id: existing.psychologist.id },
        data: {
          isActive: data.isActive,
          endDate: data.isActive ? null : new Date(),
        },
      });
    }

    await recordAudit(
      {
        userId: admin.id,
        entityType: "User",
        entityId: id,
        action: AuditAction.UPDATE,
        changedFields: { ...data, password: data.password ? "***" : undefined } as Prisma.InputJsonValue,
      },
      tx,
    );
    return result;
  });

  return Response.json({
    id: updated.id,
    name: updated.name,
    role: updated.role,
    isActive: updated.isActive,
  });
}
