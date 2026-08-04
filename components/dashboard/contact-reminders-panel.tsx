"use client";

import { useState } from "react";
import { MessageCircle, PartyPopper } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContactReminderDialog } from "@/components/dashboard/contact-reminder-dialog";
import { formatMxTime, formatMxWeekdayDate } from "@/lib/utils";

export interface ContactReminderEntry {
  id: string;
  scheduledAt: string;
  patientName: string;
  patientPhone: string;
  psychologistName: string;
}

interface ContactRemindersPanelProps {
  data: ContactReminderEntry[];
  /** Fecha (el día siguiente) usada para el subtítulo de la tarjeta. */
  date: Date;
}

export function ContactRemindersPanel({ data, date }: ContactRemindersPanelProps) {
  const [target, setTarget] = useState<ContactReminderEntry | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <CardTitle>Contactar pacientes</CardTitle>
            <CardDescription className="capitalize">
              Recordatorio de citas de mañana · {formatMxWeekdayDate(date)}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="flex items-center justify-center gap-1.5 py-4 text-center text-sm text-muted-foreground">
              <PartyPopper className="h-4 w-4" />
              No hay citas agendadas para mañana.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => setTarget(entry)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium">{entry.patientName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatMxTime(entry.scheduledAt)} · {entry.psychologistName}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entry.patientPhone}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {target && (
        <ContactReminderDialog
          entry={target}
          open={!!target}
          onOpenChange={(o) => !o && setTarget(null)}
        />
      )}
    </>
  );
}
