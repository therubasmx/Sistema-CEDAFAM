"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Position, Role, Speciality } from "@prisma/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  COORDINATION_HUB_HREF,
  coordinationFilterChildren,
  isNavChildActive,
  isNavItemActive,
  navItemsFor,
} from "@/lib/nav";
import { RequestLeaveButton } from "@/components/leave/request-leave-button";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "sidebar-collapsed";

export function Sidebar({
  role,
  position,
  psychologistArea,
}: {
  role: Role;
  position: Position | null;
  /**
   * Especialidad de quien atiende pacientes. Es `null` para quien no tiene
   * perfil de psicólogo. El botón de permiso igual se muestra sin ella para
   * Voluntario/a, que no tiene perfil pero sí puede solicitar permiso.
   */
  psychologistArea: Speciality | null;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const items = navItemsFor({ role, position });
  const [collapsed, setCollapsed] = useState(false);
  // Solo Jefe Principal y quien ocupa Atención Privada ven las seis
  // coordinaciones; el resto solo tiene acceso a la suya.
  const canSeeAllCoordinations =
    role === Role.ADMIN || position === Position.PRIVATE_CARE_SERVICES;

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r bg-card transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-3">
        {!collapsed && (
          <span className="truncate px-3 text-lg font-bold">CEDAFAM</span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menú" : "Comprimir menú"}
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          const children =
            item.children ??
            (canSeeAllCoordinations && pathname.startsWith(COORDINATION_HUB_HREF)
              ? coordinationFilterChildren()
              : undefined);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
              {children && active && !collapsed && (
                <div className="mt-1 space-y-1 pl-7">
                  {children.map((child) => {
                    const childActive = isNavChildActive(
                      child.href,
                      pathname,
                      search,
                    );
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-sm transition-colors",
                          childActive
                            ? "bg-primary/80 text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {(psychologistArea || role === Role.VOLUNTEER) && (
        <div className="border-t p-3">
          <RequestLeaveButton
            defaultArea={psychologistArea}
            collapsed={collapsed}
          />
        </div>
      )}
    </aside>
  );
}
