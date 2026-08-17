/**
 * Migración ya aplicada en producción (2026-08-17): corrigió el bug donde
 * `PsychologistAvailability` no tenía semana asociada — cada reporte semanal
 * reemplazaba TODA la disponibilidad como si fuera una plantilla recurrente
 * permanente, en vez de aplicar solo a "la semana siguiente" como dice el
 * formulario. Asignó `weekStartDate` a las 149 filas existentes en ese
 * momento, duplicándolas en la semana del 17 y la del 24 de agosto de 2026.
 *
 * `weekStartDate` es NOT NULL desde entonces, así que este script ya no
 * puede volver a correr (no hay filas sin semana que backfillear). Se deja
 * como registro histórico.
 *
 * Nota: el backfill original corrió con el TZ local de la shell (CST,
 * UTC-6) y guardó weekStartDate 6 horas desfasado de cómo Vercel lo calcula
 * en producción (UTC). Se corrigió aparte con un UPDATE directo restando
 * ese offset a las 298 filas afectadas.
 */
console.log("Backfill ya aplicado en producción el 2026-08-17. No hay nada que hacer.");
