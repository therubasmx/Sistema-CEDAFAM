import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface RecentAssignmentEntry {
  id: string;
  patientName: string;
  psychologistName: string;
  assignedAt: string;
  isExploratorySession: boolean;
}

interface RecentAssignmentsPanelProps {
  data: RecentAssignmentEntry[];
}

export function RecentAssignmentsPanel({ data }: RecentAssignmentsPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <History className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Asignaciones recientes</CardTitle>
          <CardDescription>Últimos pacientes asignados a un psicólogo.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aún no hay asignaciones registradas.
          </p>
        ) : (
          <ul className="divide-y">
            {data.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <span className="block truncate font-medium">
                    {a.patientName}
                  </span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    {a.psychologistName}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {a.isExploratorySession && (
                    <Badge variant="outline">Exploración</Badge>
                  )}
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.assignedAt), {
                      locale: es,
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
