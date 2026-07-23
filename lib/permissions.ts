import { EventKind, Position, Role } from "@prisma/client";

/**
 * Role-based permission matrix. Each permission maps to the set of roles that
 * may perform it. `PSYCHOLOGIST` access is usually scoped to "own" records —
 * that scoping is enforced at the query level, not here.
 */
export const PERMISSIONS = {
  "patients:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  "patients:create": [Role.ADMIN, Role.COORDINATOR],
  "patients:update": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT],
  // Borrar un expediente completo (p. ej. un duplicado). Elimina en cascada
  // sus citas, asignaciones, historial de estados y solicitudes de SIERE.
  "patients:delete": [Role.ADMIN, Role.COORDINATOR],
  "patients:status": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  // Editar o borrar una entrada puntual del historial de estados (por si un
  // psicólogo se equivocó al seleccionarla). El historial normal es de solo
  // lectura para todos los demás roles.
  "patients:statusManage": [Role.ADMIN, Role.COORDINATOR],
  // Revisar solicitudes del form público que hicieron match con un expediente
  // existente y decidir si se actualiza/reactiva o si es una persona distinta.
  "patients:reviewMatch": [Role.COORDINATOR, Role.ADMIN],
  "assignments:create": [Role.COORDINATOR, Role.ADMIN],
  "assignments:suggest": [Role.COORDINATOR, Role.ADMIN],
  // Editar o borrar una entrada puntual del historial de asignaciones (por si
  // se asignó al psicólogo equivocado). El historial normal es de solo
  // lectura para los demás roles.
  "assignments:manage": [Role.ADMIN, Role.COORDINATOR],
  "calendar:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  // La Contadora también puede crear citas, pero a diferencia de los demás
  // roles las agenda directo (SCHEDULED) en vez de mandar una solicitud
  // PENDING — ver POST /api/appointments.
  "appointments:create": [Role.ADMIN, Role.COORDINATOR, Role.PSYCHOLOGIST, Role.ACCOUNTANT],
  "appointments:authorizeRoom": [Role.ADMIN, Role.COORDINATOR],
  // Aceptar/rechazar solicitudes de cita (Contadora; el Jefe también puede).
  "appointments:review": [Role.ACCOUNTANT, Role.ADMIN],
  // Asignar/mover el consultorio de una cita agendada desde el tablero de
  // Consultorios (Contadora; el Jefe también puede).
  "appointments:assignRoom": [Role.ACCOUNTANT, Role.ADMIN],
  "events:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  "events:manage": [Role.ADMIN, Role.COORDINATOR],
  "reports:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT],
  "weeklyReports:read": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  "weeklyReports:create": [Role.PSYCHOLOGIST, Role.ADMIN, Role.COORDINATOR],
  // Abrir el folio de evaluación de un paciente y capturar su diagnóstico. Lo
  // hace quien evalúa; el psicólogo solo sobre pacientes que tiene asignados
  // (se verifica al consultar, no aquí).
  "evaluations:create": [Role.PSYCHOLOGIST, Role.ADMIN, Role.COORDINATOR],
  // Ver el módulo de Evaluaciones, con todos los folios emitidos.
  "evaluations:read": [Role.ACCOUNTANT, Role.ADMIN],
  // Corregir un folio y agregarle el link del informe. El psicólogo solo
  // puede corregir los folios que él mismo generó.
  "evaluations:update": [
    Role.ACCOUNTANT,
    Role.ADMIN,
    Role.COORDINATOR,
    Role.PSYCHOLOGIST,
  ],
  "siere:create": [Role.PSYCHOLOGIST, Role.COORDINATOR],
  "users:manage": [Role.ADMIN, Role.COORDINATOR],
  "announcements:send": [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT],
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

/**
 * Acceso al módulo de una coordinación. Solo entra quien ocupa ese puesto; el
 * Jefe Principal entra a todos porque supervisa las seis coordinaciones.
 */
export function canAccessPosition(
  user: { role: Role; position?: Position | null },
  position: Position,
): boolean {
  return user.role === Role.ADMIN || user.position === position;
}

/**
 * Acceso de solo lectura al módulo de una coordinación: además de quien
 * puede administrarlo, Atención Privada entra a las otras cinco para verlas
 * sin poder actuar — es la coordinación que resume lo que hace cada una.
 */
export function canViewPosition(
  user: { role: Role; position?: Position | null },
  position: Position,
): boolean {
  return (
    canAccessPosition(user, position) ||
    user.position === Position.PRIVATE_CARE_SERVICES
  );
}

/** Puestos cuyo módulo puede abrir el usuario, en el orden en que se listan. */
export function accessiblePositions(user: {
  role: Role;
  position?: Position | null;
}): Position[] {
  if (user.role === Role.ADMIN) return Object.values(Position);
  return user.position ? [user.position] : [];
}

/**
 * Tipo de evento que administra cada puesto. Los puestos que no aparecen no
 * crean eventos: su módulo es de consulta.
 */
export const POSITION_EVENT_KIND: Partial<Record<Position, EventKind>> = {
  [Position.COMMUNITY_OUTREACH]: EventKind.COMMUNITY,
  [Position.HUMAN_CAPITAL]: EventKind.HUMAN_CAPITAL,
  [Position.BIRTHDAYS]: EventKind.BIRTHDAY_PARTY,
  [Position.PROFESSIONAL_DEVELOPMENT]: EventKind.CASE_STUDY,
};

/**
 * Quién puede crear o borrar un evento de cierto tipo.
 *
 * Jefatura y coordinación conservan el permiso general que ya tenían sobre los
 * eventos internos. Además, el titular de un puesto administra el tipo que le
 * corresponde —y solo ese: quien lleva Capital Humano no crea eventos a nombre
 * de Extensión a la Comunidad.
 */
export function canManageEventKind(
  user: { role: Role; position?: Position | null },
  kind: EventKind,
): boolean {
  if (can(user.role, "events:manage")) return true;
  return user.position ? POSITION_EVENT_KIND[user.position] === kind : false;
}
