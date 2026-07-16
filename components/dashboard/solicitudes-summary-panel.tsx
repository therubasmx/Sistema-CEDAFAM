import Link from "next/link";
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
      <CardHeader>
        <CardTitle>Solicitudes de cita</CardTitle>
        <CardDescription>Resumen de las solicitudes por revisar.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay solicitudes por revisar. 🎉
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
