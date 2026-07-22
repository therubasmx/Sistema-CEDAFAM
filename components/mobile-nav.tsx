"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Position, Role, Speciality } from "@prisma/client";
import {
  ATENCION_PRIVADA_HREF,
  coordinationFilterChildren,
  isNavChildActive,
  isNavItemActive,
  navItemsFor,
} from "@/lib/nav";
import { RequestLeaveButton } from "@/components/leave/request-leave-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileNav({
  role,
  position,
  psychologistArea,
}: {
  role: Role;
  position: Position | null;
  /** Ver `Sidebar`: `null` cuando la persona no atiende pacientes. */
  psychologistArea: Speciality | null;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const items = navItemsFor({ role, position });

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card shadow-xl transition-transform duration-300 ease-in-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b px-6">
          <span className="text-lg font-bold">CEDAFAM</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Nav items */}
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
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
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
                            "block rounded-md px-3 py-2 text-sm transition-colors",
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
    </>
  );
}
