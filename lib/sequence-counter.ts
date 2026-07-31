import { Prisma } from "@prisma/client";

/**
 * Siguiente consecutivo de una secuencia (ver `SequenceCounter`). Debe
 * llamarse dentro de la misma transacción que crea el registro al que se le
 * asigna el número: el UPDATE toma el row lock de Postgres, así que dos
 * altas simultáneas se serializan y nunca reciben el mismo valor.
 */
export async function nextSequenceValue(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<number> {
  const counter = await tx.sequenceCounter.update({
    where: { name },
    data: { value: { increment: 1 } },
  });
  return counter.value;
}
