import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  role: Role;
  psychologistId: string | null;
  name?: string | null;
  email?: string | null;
}

/**
 * Guards an API route. Returns either the authenticated user or a ready-to-
 * return `Response`. Usage:
 *
 *   const guard = await requirePermission("patients:create");
 *   if (guard instanceof Response) return guard;
 *   const user = guard;
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser | Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const user = session.user as SessionUser;
  if (!can(user.role, permission)) {
    return Response.json({ error: "Permiso denegado" }, { status: 403 });
  }
  return user;
}

/** Requires authentication only (any role). */
export async function requireAuth(): Promise<SessionUser | Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  return session.user as SessionUser;
}
