"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  X,
  UserPlus,
  UserCheck,
  UserSearch,
  FileClock,
  AlertTriangle,
  DoorOpen,
  CalendarPlus,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CalendarHeart,
  Clock,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
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

/** Icono por tipo, para reconocer de un vistazo qué llegó. */
const notificationIcon: Record<NotificationType, LucideIcon> = {
  NEW_FORM_SUBMITTED: UserPlus,
  PATIENT_ASSIGNED: UserCheck,
  WEEKLY_REPORT_DUE: FileClock,
  URGENT: AlertTriangle,
  ROOM_AUTH_REQUEST: DoorOpen,
  ROOM_AUTH_RESULT: DoorOpen,
  APPOINTMENT_REQUEST: CalendarPlus,
  APPOINTMENT_REQUEST_RESULT: CalendarCheck,
  APPOINTMENT_REMINDER: Clock,
  EVENT_REMINDER: CalendarClock,
  ANNOUNCEMENT: Megaphone,
  LEAVE_REQUEST: CalendarOff,
  LEAVE_REQUEST_RESULT: CalendarCheck,
  EVENT_INVITATION: CalendarHeart,
  PATIENT_MATCH_REVIEW: UserSearch,
};

/** Color por tipo: ámbar = requiere acción, esmeralda = resuelto, rojo = urgente. */
const notificationAccent: Record<NotificationType, string> = {
  NEW_FORM_SUBMITTED: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  PATIENT_ASSIGNED: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  WEEKLY_REPORT_DUE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  URGENT: "bg-red-500/10 text-red-600 dark:text-red-400",
  ROOM_AUTH_REQUEST: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ROOM_AUTH_RESULT: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  APPOINTMENT_REQUEST: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  APPOINTMENT_REQUEST_RESULT:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  APPOINTMENT_REMINDER: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  EVENT_REMINDER: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ANNOUNCEMENT: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  LEAVE_REQUEST: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  LEAVE_REQUEST_RESULT:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  EVENT_INVITATION: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  PATIENT_MATCH_REVIEW: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

/** Destino al hacer clic en una notificación, según su tipo. */
function notificationHref(n: NotificationItem): string | null {
  if (!n.relatedEntityId) return null;
  switch (n.type) {
    case NotificationType.APPOINTMENT_REQUEST:
      return `/dashboard/solicitudes`;
    case NotificationType.PATIENT_MATCH_REVIEW:
      return `/dashboard/patients/intake-matches`;
    case NotificationType.ROOM_AUTH_REQUEST:
    case NotificationType.ROOM_AUTH_RESULT:
    case NotificationType.APPOINTMENT_REQUEST_RESULT:
    case NotificationType.APPOINTMENT_REMINDER:
      return `/dashboard/calendar?appointmentId=${n.relatedEntityId}`;
    case NotificationType.PATIENT_ASSIGNED:
    case NotificationType.NEW_FORM_SUBMITTED:
    case NotificationType.URGENT:
      return `/dashboard/patients/${n.relatedEntityId}`;
    case NotificationType.EVENT_REMINDER:
    case NotificationType.EVENT_INVITATION:
      return `/dashboard/calendar`;
    case NotificationType.LEAVE_REQUEST:
      return `/dashboard/coordinacion/desarrollo-profesional`;
    // Al psicólogo el resultado le importa en su calendario: si se aceptó, ahí
    // está ya el bloqueo.
    case NotificationType.LEAVE_REQUEST_RESULT:
      return `/dashboard/calendar`;
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

  async function clearAll(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("¿Borrar todas las notificaciones? Esta acción no se puede deshacer.")) {
      return;
    }
    setItems([]);
    setUnread(0);
    await fetch("/api/notifications", { method: "DELETE" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-destructive-foreground ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="flex items-baseline gap-1.5 p-0 text-sm">
            Notificaciones
            {unread > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                · {unread} sin leer
              </span>
            )}
          </DropdownMenuLabel>
          {items.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            >
              <X className="h-3 w-3" />
              Borrar todas
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <BellOff className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Estás al día</p>
            <p className="text-xs text-muted-foreground">
              Aquí verás las solicitudes y avisos nuevos.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {items.map((n) => {
              const Icon = notificationIcon[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => onNotificationClick(n)}
                  className={cn(
                    "flex w-full items-start gap-3 border-l-2 border-l-transparent px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                    !n.isRead && "border-l-primary bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      notificationAccent[n.type],
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "leading-snug",
                          !n.isRead && "font-semibold",
                        )}
                      >
                        {n.title}
                      </span>
                      {!n.isRead && (
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
