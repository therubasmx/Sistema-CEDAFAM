import { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

const MAX_MESSAGE_LENGTH = 1000;

/** POST /api/notifications/announcement — broadcast an "aviso" to every other active user. */
export async function POST(req: Request) {
  const guard = await requirePermission("announcements:send");
  if (guard instanceof Response) return guard;
  const sender = guard;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "El aviso no puede estar vacío." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `El aviso no puede exceder ${MAX_MESSAGE_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  const recipients = await db.user.findMany({
    where: { isActive: true, id: { not: sender.id } },
    select: { id: true },
  });
  if (recipients.length === 0) {
    return Response.json({ ok: true, recipients: 0 });
  }

  await db.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      type: NotificationType.ANNOUNCEMENT,
      title: `Aviso de ${sender.name ?? "un administrador"}`,
      message,
    })),
  });

  return Response.json({ ok: true, recipients: recipients.length });
}
