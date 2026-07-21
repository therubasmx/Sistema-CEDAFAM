import { type NextRequest } from "next/server";
import { type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { surveyResponseSchema } from "@/lib/survey";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/public/survey — encuesta de satisfacción. Sin autenticación.
 *
 * Es anónima a propósito: no se guarda nada que ligue la respuesta a un
 * paciente. Por eso tampoco se notifica a nadie al recibirla; la coordinación
 * las consulta agregadas en su módulo.
 */
export async function POST(req: NextRequest) {
  // Limita el abuso: 10 envíos por IP cada 10 minutos. Es más holgado que el
  // formulario de alta porque varios pacientes pueden contestar desde la misma
  // red de recepción.
  const limit = rateLimit(`encuesta:${clientIp(req)}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: "Demasiados envíos. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = surveyResponseSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Faltan respuestas", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await db.surveyResponse.create({
    data: { answers: parsed.data as Prisma.InputJsonValue },
  });

  // Solo se confirma la recepción: no hay nada interno que exponer.
  return Response.json({ ok: true }, { status: 201 });
}
