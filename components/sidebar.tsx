"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { navItemsForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-bold">CEDAFAM</span>
      </div>
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
