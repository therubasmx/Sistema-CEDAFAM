import Link from "next/link";
import { CalendarDays } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMxTime, formatMxWeekdayDate } from "@/lib/utils";

export interface TodayScheduleEntry {
  psychologistId: string;
  name: string;
  appointments: {
    id: string;
    scheduledAt: string;
    patientName: string;
    patientFileNumber: string | null;
  }[];
}

interface TodaySchedulePanelProps {
  data: TodayScheduleEntry[];
  /** Card title. Defaults to today's copy. */
  title?: string;
  /** Date used for the weekday label. Defaults to now. */
  date?: Date;
  /** Message shown when there are no appointments. */
  emptyMessage?: string;
}

export function TodaySchedulePanel({
  data,
  title = "Psicólogos con citas hoy",
  date = new Date(),
  emptyMessage = "Ningún psicólogo tiene citas agendadas hoy.",
}: TodaySchedulePanelProps) {
  const dateLabel = formatMxWeekdayDate(date);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="capitalize">{dateLabel}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="space-y-4">
            {data.map((entry) => (
              <li key={entry.psychologistId} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/calendar?psychologistId=${entry.psychologistId}&view=day`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                      {entry.name.charAt(0).toUpperCase()}
                    </span>
                    {entry.name}
                  </Link>
                  <Badge variant="secondary">
                    {entry.appointments.length}{" "}
                    {entry.appointments.length === 1 ? "cita" : "citas"}
                  </Badge>
                </div>
                <ul className="space-y-1 pl-8 text-sm text-muted-foreground">
                  {entry.appointments.map((a) => (
                    <li key={a.id} className="flex gap-2">
                      <span className="font-medium text-foreground">
                        {formatMxTime(a.scheduledAt)}
                      </span>
                      <span className="truncate">
                        {a.patientName}
                        {a.patientFileNumber && (
                          <span className="text-xs"> · Exp. {a.patientFileNumber}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
