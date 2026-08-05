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

/** "06 agosto" style — 2-digit day + month name, in Mexico City time. */
function formatReminderDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.toLocaleDateString("es-MX", { day: "2-digit", timeZone: "America/Mexico_City" });
  const month = d.toLocaleDateString("es-MX", { month: "long", timeZone: "America/Mexico_City" });
  return `${day} ${month}`;
}

/** "09:00 am" style — 12-hour, lowercase am/pm, in Mexico City time. */
function formatReminderTime(date: Date | string): string {
  const [hourStr, minute] = formatMxTime(date).split(":");
  const hour24 = parseInt(hourStr, 10);
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${hour12.toString().padStart(2, "0")}:${minute} ${period}`;
}

function buildReminderMessage(entry: ContactReminderEntry): string {
  const date = formatReminderDate(entry.scheduledAt);
  const time = formatReminderTime(entry.scheduledAt);
  return (
    `¡Hola!\n\n` +
    `Le recordamos que el paciente ${entry.patientName} tiene una cita programada con ${entry.psychologistName} el ${date} a las ${time}.\n\n` +
    `Por favor, confirme su asistencia respondiendo a este mensaje.\n\n` +
    `Si no podrá asistir, le agradecemos avisarnos con anticipación para ofrecer ese espacio a otro paciente.\n\n` +
    `Atentamente,\nCEDAFAM`
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
