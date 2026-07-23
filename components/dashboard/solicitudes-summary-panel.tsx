import Link from "next/link";
import { Inbox, PartyPopper } from "lucide-react";
import { AppointmentStatus } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { appointmentStatusLabels } from "@/lib/labels";
import { formatMxDateTime } from "@/lib/utils";

export interface SolicitudSummaryEntry {
  id: string;
  patientName: string;
  psychologistName: string;
  status: AppointmentStatus;
  scheduledAt: string;
}

const statusVariant: Record<"PENDING" | "REJECTED", BadgeProps["variant"]> = {
  PENDING: "warning",
  REJECTED: "destructive",
};

interface SolicitudesSummaryPanelProps {
  /** Requests to preview (already limited to a handful). */
  data: SolicitudSummaryEntry[];
  /** Total number of pending/rejected requests, for the "ver todas" hint. */
  total: number;
}

export function SolicitudesSummaryPanel({
  data,
  total,
}: SolicitudesSummaryPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Inbox className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Solicitudes de cita</CardTitle>
          <CardDescription>Resumen de las solicitudes por revisar.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 py-4 text-center text-sm text-muted-foreground">
            <PartyPopper className="h-4 w-4" />
            No hay solicitudes por revisar.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate font-medium">{s.patientName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {s.psychologistName} · {formatMxDateTime(s.scheduledAt)}
                  </p>
                </div>
                <Badge
                  variant={statusVariant[s.status as "PENDING" | "REJECTED"]}
                >
                  {appointmentStatusLabels[s.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {total > 0 && (
          <div className="mt-4 text-right">
            <Link
              href="/dashboard/solicitudes"
              className="text-sm font-medium hover:underline"
            >
              Ver todas las solicitudes
              {total > data.length ? ` (${total})` : ""}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
