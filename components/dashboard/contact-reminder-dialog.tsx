"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMxTime, formatMxWeekdayDate } from "@/lib/utils";
import type { ContactReminderEntry } from "@/components/dashboard/contact-reminders-panel";

interface ContactReminderDialogProps {
  entry: ContactReminderEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A los números capturados sin código de país (10 dígitos, el caso normal) se les antepone 52. */
function toWhatsAppPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.length === 10 ? `52${digits}` : digits;
}

function buildReminderMessage(entry: ContactReminderEntry): string {
  const date = formatMxWeekdayDate(new Date(entry.scheduledAt));
  const time = formatMxTime(entry.scheduledAt);
  return (
    `Hola ${entry.patientName}, te recordamos tu cita de mañana ${date} ` +
    `a las ${time} con tu psicólogo(a) ${entry.psychologistName}. ` +
    `Por favor confírmanos tu asistencia respondiendo este mensaje.`
  );
}

export function ContactReminderDialog({
  entry,
  open,
  onOpenChange,
}: ContactReminderDialogProps) {
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${toWhatsAppPhone(
    entry.patientPhone,
  )}&text=${encodeURIComponent(buildReminderMessage(entry))}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{entry.patientName}</DialogTitle>
          <DialogDescription>
            Cita de mañana · {formatMxWeekdayDate(new Date(entry.scheduledAt))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <Field label="Hora" value={formatMxTime(entry.scheduledAt)} />
          <Field label="Psicólogo(a)" value={entry.psychologistName} />
          <Field label="Teléfono" value={entry.patientPhone} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button asChild>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              Contactar
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
