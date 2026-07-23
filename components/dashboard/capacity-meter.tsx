import { cn } from "@/lib/utils";

interface CapacityMeterProps {
  value: number;
  capacity: number;
  overflow?: boolean;
}

/** Barra de progreso compacta compartida por los paneles de capacidad y ocupación. */
export function CapacityMeter({ value, capacity, overflow = false }: CapacityMeterProps) {
  const pct = overflow ? 100 : capacity > 0 ? Math.min(100, (value / capacity) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", overflow ? "bg-red-500" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
