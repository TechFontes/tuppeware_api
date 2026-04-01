import { describe, it, expect } from 'vitest';
import { getPaginationParams, paginatedResponse } from '../../../utils/pagination';

describe('getPaginationParams', () => {
  it('retorna defaults quando query está vazia', () => {
    const result = getPaginationParams({});
    expect(result).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it('parseia page e limit válidos', () => {
    const result = getPaginationParams({ page: '3', limit: '20' });
    expect(result).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it('clipa page ao mínimo 1', () => {
    expect(getPaginationParams({ page: '0' }).page).toBe(1);
    expect(getPaginationParams({ page: '-5' }).page).toBe(1);
  });

  it('clipa limit ao máximo 100', () => {
    expect(getPaginationParams({ limit: '999' }).limit).toBe(100);
  });

  it('clipa limit ao mínimo 1', () => {
    // limit '0' é falsy após parseInt, então retorna DEFAULT_LIMIT (10) via ||
    // limit negativo é parseado e então clipado para 1 via Math.max
    expect(getPaginationParams({ limit: '-1' }).limit).toBe(1);
  });

  it('calcula skip corretamente', () => {
    expect(getPaginationParams({ page: '5', limit: '15' }).skip).toBe(60);
  });

  it('trata valores não-numéricos como defaults', () => {
    const result = getPaginationParams({ page: 'abc', limit: 'xyz' });
    expect(result).toEqual({ page: 1, limit: 10, skip: 0 });
  });
});

describe('paginatedResponse', () => {
  it('retorna estrutura correta com metadados de paginação', () => {
    const data = [{ id: '1' }];
    const result = paginatedResponse(data, 25, 2, 10);
    expect(result).toEqual({
      data,
      pagination: {
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
  });

  it('hasNextPage é false na última página', () => {
    const result = paginatedResponse([], 10, 1, 10);
    expect(result.pagination.hasNextPage).toBe(false);
  });

  it('hasPreviousPage é false na primeira página', () => {
    const result = paginatedResponse([], 10, 1, 10);
    expect(result.pagination.hasPreviousPage).toBe(false);
  });

  it('totalPages arredonda para cima', () => {
    const result = paginatedResponse([], 11, 1, 10);
    expect(result.pagination.totalPages).toBe(2);
  });

  it('funciona com array vazio e total zero', () => {
    const result = paginatedResponse([], 0, 1, 10);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNextPage).toBe(false);
  });
});
