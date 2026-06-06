import { Role } from "@prisma/client";

export interface NavItem {
  href: string;
  label: string;
  /** Roles allowed to see this item. */
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/patients",
    label: "Pacientes",
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/assignments",
    label: "Asignaciones",
    roles: [Role.ADMIN, Role.COORDINATOR],
  },
  {
    href: "/dashboard/calendar",
    label: "Calendario",
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/weekly-report",
    label: "Reporte semanal",
    roles: [Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/availability",
    label: "Disponibilidad",
    roles: [Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/reports",
    label: "Reportes",
    roles: [Role.ADMIN, Role.COORDINATOR],
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    roles: [Role.ADMIN, Role.COORDINATOR],
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
