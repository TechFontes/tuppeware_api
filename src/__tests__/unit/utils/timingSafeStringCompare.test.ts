import { describe, it, expect } from 'vitest';
import { timingSafeStringCompare } from '../../../utils/timingSafeStringCompare';

describe('timingSafeStringCompare', () => {
  it('retorna true para strings iguais', () => {
    expect(timingSafeStringCompare('abc123', 'abc123')).toBe(true);
  });

  it('retorna false para strings diferentes do mesmo tamanho', () => {
    expect(timingSafeStringCompare('abc123', 'xyz123')).toBe(false);
  });

  it('retorna false para strings de tamanhos diferentes (sem chamar timingSafeEqual)', () => {
    expect(timingSafeStringCompare('short', 'longerstring')).toBe(false);
  });

  it('retorna true para duas strings vazias', () => {
    expect(timingSafeStringCompare('', '')).toBe(true);
  });
});
