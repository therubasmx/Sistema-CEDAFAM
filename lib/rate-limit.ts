/**
 * Limitador de tasa en memoria (ventana fija) por clave (normalmente IP).
 *
 * Suficiente para frenar fuerza bruta de login y spam del formulario público.
 * En Vercel Fluid Compute las instancias se reutilizan, así que ofrece
 * protección real; para un límite global estricto entre regiones/instancias,
 * sustituir el `Map` por Upstash Redis (`@upstash/ratelimit`).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Limpieza perezosa para que el Map no crezca sin límite.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Registra un intento para `key`. Devuelve `ok: false` cuando se supera
 * `limit` dentro de la ventana `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Extrae la IP del cliente respetando los headers de proxy de Vercel. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
