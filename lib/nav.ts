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
  type LucideIcon,
} from "lucide-react";
import { Role } from "@prisma/client";

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

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
