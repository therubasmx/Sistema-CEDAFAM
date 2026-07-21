import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Calendar,
  FileText,
  CalendarClock,
  BarChart3,
  UserCog,
  Inbox,
  DoorOpen,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { Position, Role } from "@prisma/client";
import { positionShortLabels, positionSlugs } from "@/lib/labels";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. */
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    icon: LayoutDashboard,
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/patients",
    label: "Pacientes",
    icon: Users,
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/assignments",
    label: "Asignaciones",
    icon: ClipboardList,
    roles: [Role.ADMIN, Role.COORDINATOR],
  },
  {
    href: "/dashboard/calendar",
    label: "Calendario",
    icon: Calendar,
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
  },
  {
    href: "/dashboard/solicitudes",
    label: "Solicitudes",
    icon: Inbox,
    roles: [Role.ACCOUNTANT, Role.ADMIN],
  },
  {
    href: "/dashboard/consultorios",
    label: "Consultorios",
    icon: DoorOpen,
    roles: [Role.ACCOUNTANT, Role.ADMIN],
  },
  {
    href: "/dashboard/weekly-report",
    label: "Reporte semanal",
    icon: FileText,
    roles: [Role.PSYCHOLOGIST, Role.ADMIN, Role.COORDINATOR],
  },
  {
    href: "/dashboard/availability",
    label: "Disponibilidad",
    icon: CalendarClock,
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT],
  },
  {
    href: "/dashboard/reports",
    label: "Reportes",
    icon: BarChart3,
    roles: [Role.ADMIN, Role.COORDINATOR],
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    icon: UserCog,
    roles: [Role.ADMIN, Role.COORDINATOR],
  },
];

/**
 * Regla de "ruta activa", compartida por la barra lateral y el menú móvil.
 * `/dashboard` exige coincidencia exacta porque de lo contrario quedaría
 * resaltado en todas las pantallas.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

/** Ruta del hub que lista las seis coordinaciones (solo Jefe Principal). */
export const COORDINATION_HUB_HREF = "/dashboard/coordinacion";

/** Ruta del módulo de un puesto. */
export function coordinationHref(position: Position): string {
  return `${COORDINATION_HUB_HREF}/${positionSlugs[position]}`;
}

/**
 * Ítems de la barra lateral para un usuario.
 *
 * A los ítems fijos por rol se suma el módulo de coordinación, que no depende
 * del rol sino del puesto: quien ocupa un puesto ve el suyo, y el Jefe
 * Principal ve una sola entrada hacia el hub con las seis (meter seis entradas
 * sueltas dejaría la barra ilegible).
 */
export function navItemsFor({
  role,
  position,
}: {
  role: Role;
  position?: Position | null;
}): NavItem[] {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  if (role === Role.ADMIN) {
    items.push({
      href: COORDINATION_HUB_HREF,
      label: "Coordinaciones",
      icon: Building2,
      roles: [Role.ADMIN],
    });
  } else if (position) {
    items.push({
      href: coordinationHref(position),
      label: positionShortLabels[position],
      icon: Building2,
      roles: [role],
    });
  }

  return items;
}
