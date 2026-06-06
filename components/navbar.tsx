"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Role } from "@prisma/client";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/lib/labels";

interface NavbarProps {
  name: string;
  role: Role;
}

export function Navbar({ name, role }: NavbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="md:hidden text-lg font-bold">CEDAFAM</div>
      <div className="ml-auto flex items-center gap-4">
        <ThemeToggle />
        <NotificationBell />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{name}</p>
          <p className="text-xs text-muted-foreground">{roleLabels[role]}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Cerrar sesión"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
