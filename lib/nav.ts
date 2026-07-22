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
  UserSearch,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import { Position, Role } from "@prisma/client";
import { positionShortLabels, positionSlugs, POSITION_ORDER } from "@/lib/labels";

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. */
  roles: Role[];
  /** Subitems que se despliegan bajo este ítem cuando está activo. */
  children?: NavChild[];
}

/** Ruta del hub de Observatorio (solo Jefe Principal e Innovación e Investigación). */
export const OBSERVATORIO_HREF = "/dashboard/observatorio";

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
    href: "/dashboard/patients/intake-matches",
    label: "Posibles duplicados",
    icon: UserSearch,
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
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT],
  },
  {
    href: OBSERVATORIO_HREF,
    label: "Observatorio",
    icon: Telescope,
    // El filtro por puesto (ver `navItemsFor`) hace la restricción real: solo
    // Jefe Principal y quien ocupa Innovación e Investigación lo ven. Se deja
    // el arreglo de roles amplio porque ese puesto no está atado a un rol.
    roles: [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT, Role.PSYCHOLOGIST],
    children: [
      { href: "/dashboard/observatorio/sdq", label: "SDQ" },
      { href: "/dashboard/observatorio/ecom", label: "ECOM" },
      { href: "/dashboard/observatorio/evaluacion", label: "Evaluación" },
    ],
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

/**
 * Regla de "subitem activo": a diferencia de `isNavItemActive`, exige ruta
 * exacta y compara también el query string, porque el filtro de Atención
 * Privada vive ahí en vez de en la ruta.
 */
export function isNavChildActive(
  href: string,
  pathname: string,
  search: string,
): boolean {
  const [childPath, childQuery = ""] = href.split("?");
  return pathname === childPath && search === childQuery;
}

/** Ruta del hub que lista las seis coordinaciones (solo Jefe Principal). */
export const COORDINATION_HUB_HREF = "/dashboard/coordinacion";

/** Ruta del módulo de un puesto. */
export function coordinationHref(position: Position): string {
  return `${COORDINATION_HUB_HREF}/${positionSlugs[position]}`;
}

/** Ruta del panel de Atención Privada. */
export const ATENCION_PRIVADA_HREF = coordinationHref(
  Position.PRIVATE_CARE_SERVICES,
);

/** Query param que fija, en esa ruta, qué coordinación se está mirando. */
export const COORDINATION_FILTER_PARAM = "coordinacion";

/**
 * Subitems del panel de Atención Privada: "Todas" + las otras cinco
 * coordinaciones, como enlaces que fijan el filtro vía query param. Se
 * inyectan bajo cualquier ítem de la barra que lleve a esa página — el suyo
 * propio si eres su titular, o "Coordinaciones" si eres Jefe Principal y
 * entraste a mirarla.
 */
export function coordinationFilterChildren(): NavChild[] {
  return [
    { href: ATENCION_PRIVADA_HREF, label: "Todas" },
    ...POSITION_ORDER.filter((p) => p !== Position.PRIVATE_CARE_SERVICES).map(
      (p) => ({
        href: `${ATENCION_PRIVADA_HREF}?${COORDINATION_FILTER_PARAM}=${p}`,
        label: positionShortLabels[p],
      }),
    ),
  ];
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
  const items = NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    // Observatorio queda reservado a Jefe Principal y a quien ocupa el
    // puesto de Innovación e Investigación, que es quien usa esos
    // instrumentos de evaluación.
    if (item.href === OBSERVATORIO_HREF) {
      return role === Role.ADMIN || position === Position.INNOVATION_RESEARCH;
    }
    return true;
  });

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
