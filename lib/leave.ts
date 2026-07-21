import { LeaveUnit } from "@prisma/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  endOfMxDay,
  formatMxDateInput,
  mxSlotStart,
  startOfMxDay,
} from "@/lib/utils";

/** Los campos de una solicitud que definen su ventana de ausencia. */
export interface LeaveWindow {
  unit: LeaveUnit;
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
}

/**
 * Traduce una solicitud al rango que hay que bloquear en el calendario.
 *
 * Por horas, el rango son las horas indicadas de ese día. Por días, se toma el
 * día completo —de las 00:00 del primero a las 23:59:59 del último— porque un
 * permiso de día entero debe cerrar toda la agenda, no una franja.
 *
 * Todo se calcula en hora de Ciudad de México con los helpers de `lib/utils`:
 * esta función corre en el servidor, que en Vercel va en UTC, y construir las
 * fechas con el reloj del servidor correría el bloqueo seis horas.
 */
export function leaveBlockRange(leave: LeaveWindow): { start: Date; end: Date } {
  if (leave.unit === LeaveUnit.HOURS && leave.startTime && leave.endTime) {
    const day = formatMxDateInput(leave.startDate);
    return {
      start: mxSlotStart(day, leave.startTime),
      end: mxSlotStart(day, leave.endTime),
    };
  }

  return {
    start: startOfMxDay(leave.startDate),
    end: endOfMxDay(leave.endDate),
  };
}

/** "29 de enero, 5:30 – 6:30" o "29 de enero – 2 de febrero". */
export function leaveRangeLabel(leave: LeaveWindow): string {
  if (leave.unit === LeaveUnit.HOURS && leave.startTime && leave.endTime) {
    return `${format(leave.startDate, "d 'de' MMMM", { locale: es })}, ${leave.startTime} – ${leave.endTime}`;
  }
  const sameDay =
    format(leave.startDate, "yyyy-MM-dd") === format(leave.endDate, "yyyy-MM-dd");
  return sameDay
    ? format(leave.startDate, "d 'de' MMMM", { locale: es })
    : `${format(leave.startDate, "d 'de' MMMM", { locale: es })} – ${format(leave.endDate, "d 'de' MMMM", { locale: es })}`;
}
