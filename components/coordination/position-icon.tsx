import {
  Building2,
  FlaskConical,
  GraduationCap,
  HeartHandshake,
  Users,
  Cake,
  type LucideIcon,
} from "lucide-react";
import type { Position } from "@prisma/client";
import { cn } from "@/lib/utils";

export const positionIcon: Record<Position, LucideIcon> = {
  PRIVATE_CARE_SERVICES: Building2,
  INNOVATION_RESEARCH: FlaskConical,
  PROFESSIONAL_DEVELOPMENT: GraduationCap,
  COMMUNITY_OUTREACH: HeartHandshake,
  HUMAN_CAPITAL: Users,
  BIRTHDAYS: Cake,
};

/** Insignia de color por puesto, para distinguir las seis coordinaciones de un vistazo. */
export const positionAccent: Record<Position, string> = {
  PRIVATE_CARE_SERVICES: "bg-primary/10 text-primary",
  INNOVATION_RESEARCH: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  PROFESSIONAL_DEVELOPMENT: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  COMMUNITY_OUTREACH: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  HUMAN_CAPITAL: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  BIRTHDAYS: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export function PositionIconBadge({
  position,
  className,
}: {
  position: Position;
  className?: string;
}) {
  const Icon = positionIcon[position];
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        positionAccent[position],
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}
