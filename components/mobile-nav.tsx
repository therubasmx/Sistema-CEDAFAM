"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Role } from "@prisma/client";
import { navItemsForRole } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = navItemsForRole(role);

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
          "fixed inset-y-0 left-0 z-50 w-64 bg-card shadow-xl transition-transform duration-300 ease-in-out md:hidden",
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
        <nav className="space-y-1 p-3">
          {items.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
