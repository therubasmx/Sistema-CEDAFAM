"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Role } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

const ALLOWED_ROLES: Role[] = [Role.ADMIN, Role.COORDINATOR, Role.ACCOUNTANT];
const MAX_LENGTH = 1000;

export function SendAnnouncementButton({ role }: { role: Role }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ALLOWED_ROLES.includes(role)) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/notifications/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo enviar el aviso.");
      return;
    }
    toast({ title: "Aviso enviado", variant: "success" });
    setMessage("");
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Megaphone className="h-4 w-4" />
        Enviar aviso
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar aviso</DialogTitle>
            <DialogDescription>
              Se enviará de inmediato a todos los usuarios del sistema.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Textarea
              autoFocus
              required
              maxLength={MAX_LENGTH}
              rows={5}
              placeholder="Escribe el aviso…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !message.trim()}>
                {submitting ? "Enviando…" : "Enviar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
