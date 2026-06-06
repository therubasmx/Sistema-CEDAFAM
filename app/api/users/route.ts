import { type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { userCreateSchema } from "@/lib/validators";
import { recordAudit, AuditAction } from "@/lib/audit";

/** GET /api/users — list all users (admin only). */
export async function GET() {
  const guard = await requirePermission("users:manage");
  if (guard instanceof Response) return guard;

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      psychologist: {
        select: { speciality: true, workType: true, isActive: true },
      },
    },
  });
  return Response.json(users);
}

/**
 * POST /api/users — create a user. For psychologists, also creates the linked
 * psychologist profile in the same transaction.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("users:manage");
  if (guard instanceof Response) return guard;
  const admin = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const hashed = await bcrypt.hash(data.password, 10);

  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          password: hashed,
          role: data.role,
        },
      });

      if (data.speciality && data.workType) {
        await tx.psychologist.create({
          data: {
            userId: created.id,
            speciality: data.speciality,
            workType: data.workType,
          },
        });
      }

      await recordAudit(
        {
          userId: admin.id,
          entityType: "User",
          entityId: created.id,
          action: AuditAction.CREATE,
          changedFields: { email: data.email, role: data.role },
        },
        tx,
      );

      return created;
    });

    return Response.json(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Ese correo ya está registrado" }, { status: 409 });
    }
    throw e;
  }
}
