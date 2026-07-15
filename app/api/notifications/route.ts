import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { ensureUpcomingReminders } from "@/lib/reminders";

/** GET /api/notifications — current user's notifications, newest first. */
export async function GET() {
  const guard = await requireAuth();
  if (guard instanceof Response) return guard;
  const user = guard;

  await ensureUpcomingReminders(user);

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  return Response.json({ notifications, unreadCount });
}
