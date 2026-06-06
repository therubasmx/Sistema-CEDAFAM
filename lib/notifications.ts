import { type Prisma, NotificationType, Role } from "@prisma/client";
import { db } from "@/lib/db";

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId?: string;
}

export async function createNotification(
  input: NotifyInput,
  client: Prisma.TransactionClient | typeof db = db,
) {
  await client.notification.create({ data: input });
}

/** Fan-out a notification to every active user with the given role. */
export async function notifyRole(
  role: Role,
  input: Omit<NotifyInput, "userId">,
  client: Prisma.TransactionClient | typeof db = db,
) {
  const users = await client.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
  if (users.length === 0) return;
  await client.notification.createMany({
    data: users.map((u) => ({ ...input, userId: u.id })),
  });
}

export { NotificationType };
