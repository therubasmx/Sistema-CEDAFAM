"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Position, Role, Speciality } from "@prisma/client";
import {
  ATENCION_PRIVADA_HREF,
  coordinationFilterChildren,
  isNavChildActive,
  isNavItemActive,
  navItemsFor,
} from "@/lib/nav";
import { RequestLeaveButton } from "@/components/leave/request-leave-button";
import { cn } from "@/lib/utils";

export function Sidebar({
  role,
  position,
  psychologistArea,
}: {
  role: Role;
  position: Position | null;
  /**
   * Especialidad de quien atiende pacientes. Es `null` para quien no tiene
   * perfil de psicólogo, y por eso mismo no ve el botón de permiso: la
   * solicitud cuelga de ese perfil.
   */
  psychologistArea: Speciality | null;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const items = navItemsFor({ role, position });

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-bold">CEDAFAM</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = isNavItemActive(item.href, pathname);
          const children =
            item.children ??
            (pathname.startsWith(ATENCION_PRIVADA_HREF)
              ? coordinationFilterChildren()
              : undefined);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
              {children && active && (
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
      {psychologistArea && (
        <div className="border-t p-3">
          <RequestLeaveButton defaultArea={psychologistArea} />
        </div>
      )}
    </aside>
  );
}
