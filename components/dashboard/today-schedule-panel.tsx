import Link from "next/link";
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
  }[];
}

interface TodaySchedulePanelProps {
  data: TodayScheduleEntry[];
}

export function TodaySchedulePanel({ data }: TodaySchedulePanelProps) {
  const today = formatMxWeekdayDate(new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Psicólogos con citas hoy</CardTitle>
        <CardDescription className="capitalize">{today}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ningún psicólogo tiene citas agendadas hoy.
          </p>
        ) : (
          <ul className="space-y-4">
            {data.map((entry) => (
              <li key={entry.psychologistId} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/calendar?psychologistId=${entry.psychologistId}&view=day`}
                    className="font-medium hover:underline"
                  >
                    {entry.name}
                  </Link>
                  <Badge variant="secondary">
                    {entry.appointments.length}{" "}
                    {entry.appointments.length === 1 ? "cita" : "citas"}
                  </Badge>
                </div>
                <ul className="space-y-1 pl-1 text-sm text-muted-foreground">
                  {entry.appointments.map((a) => (
                    <li key={a.id} className="flex gap-2">
                      <span className="font-medium text-foreground">
                        {formatMxTime(a.scheduledAt)}
                      </span>
                      <span className="truncate">{a.patientName}</span>
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
