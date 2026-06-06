import { Role } from "@prisma/client";

/**
 * Role-based permission matrix. Each permission maps to the set of roles that
 * may perform it. `PSYCHOLOGIST` access is usually scoped to "own" records —
 * that scoping is enforced at the query level, not here.
 */
export const PERMISSIONS = {
  "patients:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  "patients:create": [Role.ADMIN, Role.COORDINATOR],
  "patients:update": [Role.ADMIN, Role.COORDINATOR],
  "patients:status": [Role.ADMIN, Role.COORDINATOR, Role.PSYCHOLOGIST],
  "assignments:create": [Role.COORDINATOR, Role.ADMIN],
  "assignments:suggest": [Role.COORDINATOR, Role.ADMIN],
  "calendar:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  "appointments:create": [Role.ADMIN, Role.COORDINATOR, Role.PSYCHOLOGIST],
  "reports:read": [Role.ADMIN, Role.COORDINATOR],
  "weeklyReports:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  "weeklyReports:create": [Role.PSYCHOLOGIST],
  "siere:create": [Role.PSYCHOLOGIST, Role.COORDINATOR],
  "users:manage": [Role.ADMIN, Role.COORDINATOR],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Roles that can see *all* records rather than only their own. */
export function hasGlobalScope(role: Role): boolean {
  return role === Role.ADMIN || role === Role.COORDINATOR || role === Role.ACCOUNTANT;
}
