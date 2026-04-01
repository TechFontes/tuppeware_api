import { describe, it, expect } from 'vitest';
import { isValidCPF, cleanCPF, formatCPF } from '../../../utils/cpfValidator';

describe('isValidCPF', () => {
  it('retorna true para CPF válido sem formatação', () => {
    expect(isValidCPF('11144477735')).toBe(true);
  });

  it('retorna true para CPF válido com formatação', () => {
    expect(isValidCPF('111.444.777-35')).toBe(true);
  });

  it('retorna false para todos os dígitos iguais', () => {
    expect(isValidCPF('11111111111')).toBe(false);
    expect(isValidCPF('00000000000')).toBe(false);
  });

  it('retorna false para CPF com comprimento incorreto', () => {
    expect(isValidCPF('1234567890')).toBe(false);
    expect(isValidCPF('123456789012')).toBe(false);
  });

  it('retorna false para primeiro dígito verificador errado', () => {
    expect(isValidCPF('11144477736')).toBe(false);
  });

  it('retorna false para segundo dígito verificador errado', () => {
    expect(isValidCPF('11144477734')).toBe(false);
  });

  it('retorna false para string vazia', () => {
    expect(isValidCPF('')).toBe(false);
  });
});

describe('cleanCPF', () => {
  it('remove pontos e hífen', () => {
    expect(cleanCPF('111.444.777-35')).toBe('11144477735');
  });

  it('retorna dígitos sem alteração', () => {
    expect(cleanCPF('11144477735')).toBe('11144477735');
  });

  it('remove espaços e outros caracteres', () => {
    expect(cleanCPF('111 444 777 35')).toBe('11144477735');
  });
});

describe('formatCPF', () => {
  it('formata CPF limpo no padrão XXX.XXX.XXX-XX', () => {
    expect(formatCPF('11144477735')).toBe('111.444.777-35');
  });

  it('re-formata CPF já formatado', () => {
    expect(formatCPF('111.444.777-35')).toBe('111.444.777-35');
  });
});
