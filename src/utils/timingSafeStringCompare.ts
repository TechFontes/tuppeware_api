import { timingSafeEqual } from 'crypto';

/**
 * Compara duas strings em tempo constante para evitar timing attacks.
 * Retorna false se os comprimentos diferirem (sem chamar timingSafeEqual,
 * que requer buffers de mesmo tamanho).
 */
export function timingSafeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) { return false; }
  return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}
