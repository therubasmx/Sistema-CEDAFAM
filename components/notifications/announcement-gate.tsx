"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { NotificationType } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
}

const POLL_MS = 30_000;

/**
 * Mounted in every dashboard-family layout. Polls for unread ANNOUNCEMENT
 * notifications and, if any arrive, blocks the screen with a non-dismissible
 * modal (no close button, ignores Escape/outside click) showing only a
 * "Leído" button — mirrors the WeeklyReportGate pattern.
 */
export function AnnouncementGate() {
  const [queue, setQueue] = useState<AnnouncementItem[]>([]);
  const [acking, setAcking] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      const pending: AnnouncementItem[] = (data.notifications ?? [])
        .filter(
          (n: { type: NotificationType; isRead: boolean }) =>
            n.type === NotificationType.ANNOUNCEMENT && !n.isRead,
        )
        .reverse(); // oldest aviso first
      if (pending.length > 0) {
        setQueue((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          const fresh = pending.filter((n) => !seen.has(n.id));
          return [...prev, ...fresh];
        });
      }
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const current = queue[0];

  async function markRead() {
    if (!current) return;
    setAcking(true);
    await fetch(`/api/notifications/${current.id}/read`, { method: "PUT" }).catch(() => {});
    setAcking(false);
    setQueue((prev) => prev.slice(1));
  }

  if (!current) return null;

  return (
    <Dialog open>
      <DialogContent
        hideClose
        className="max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {current.title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-foreground">
            {current.message}
          </DialogDescription>
        </DialogHeader>
        <Button onClick={markRead} disabled={acking} className="w-full">
          Leído
        </Button>
      </DialogContent>
    </Dialog>
  );
}
