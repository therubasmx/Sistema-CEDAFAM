"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { NotificationType } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Destino al hacer clic en una notificación, según su tipo. */
function notificationHref(n: NotificationItem): string | null {
  if (!n.relatedEntityId) return null;
  switch (n.type) {
    case NotificationType.ROOM_AUTH_REQUEST:
    case NotificationType.ROOM_AUTH_RESULT:
      return `/dashboard/calendar?appointmentId=${n.relatedEntityId}`;
    case NotificationType.PATIENT_ASSIGNED:
    case NotificationType.NEW_FORM_SUBMITTED:
    case NotificationType.URGENT:
      return `/dashboard/patients/${n.relatedEntityId}`;
    default:
      return null;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/sounds/notification.wav");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications);
      setUnread(data.unreadCount);

      const prev = prevUnreadRef.current;
      if (prev !== null && data.unreadCount > prev) {
        audioRef.current?.play().catch(() => {
          /* el navegador puede bloquear autoplay hasta la primera interacción */
        });
      }
      prevUnreadRef.current = data.unreadCount;
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    load();
    // Lightweight polling — real-time push is a later milestone.
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
  }

  function onNotificationClick(n: NotificationItem) {
    if (!n.isRead) markRead(n.id);
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-full p-2 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No tienes notificaciones.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => onNotificationClick(n)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                  !n.isRead && "bg-blue-50",
                )}
              >
                <span className="font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.message}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.createdAt), {
                    addSuffix: true,
                    locale: es,
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
