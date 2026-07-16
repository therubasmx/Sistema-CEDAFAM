const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a "YYYY-MM-DD" param as a local midnight Date (avoids UTC-parsing off-by-one-day). */
function parseLocalDate(value: string | null): Date | null {
  if (!value) return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface DateRange {
  /** Inclusive, local midnight. */
  start: Date;
  /** Inclusive, local midnight. */
  end: Date;
}

/** Parses and validates the `start`/`end` query params for the reports API. Both inclusive. */
export function parseDateRange(startParam: string | null, endParam: string | null): DateRange | null {
  const start = parseLocalDate(startParam);
  const end = parseLocalDate(endParam);
  if (!start || !end || start > end) return null;
  return { start, end };
}
