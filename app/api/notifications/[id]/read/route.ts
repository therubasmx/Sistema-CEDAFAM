import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

/** PUT /api/notifications/[id]/read — mark one notification as read. */
export async function PUT(_req: NextRequest, { params }: Params) {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;
  const { id } = await params;

  // Scope the update to the owner so users can't touch others' notifications.
  const result = await db.notification.updateMany({
    where: { id, userId: user.id },
    data: { isRead: true },
  });

  if (result.count === 0) {
    return Response.json({ error: "No encontrada" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
