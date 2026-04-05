import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../repositories/SettingsRepository', () => ({
  default: {
    getAll: vi.fn(),
    setMany: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import settingsService from '../../../services/SettingsService';
import settingsRepository from '../../../repositories/SettingsRepository';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsService', () => {
  it('getAll retorna todas as configurações', async () => {
    vi.mocked(settingsRepository.getAll).mockResolvedValueOnce({ max_active_payment_links: '5' });
    const result = await settingsService.getAll();
    expect(result).toEqual({ max_active_payment_links: '5' });
  });

  it('setMany atualiza e retorna configurações', async () => {
    vi.mocked(settingsRepository.setMany).mockResolvedValueOnce(undefined as any);
    vi.mocked(settingsRepository.getAll).mockResolvedValueOnce({ max_active_payment_links: '10' });
    const result = await settingsService.setMany({ max_active_payment_links: '10' });
    expect(settingsRepository.setMany).toHaveBeenCalledWith({ max_active_payment_links: '10' });
    expect(result).toEqual({ max_active_payment_links: '10' });
  });
});

describe('SettingsService.setMany — validação', () => {
  it('rejeita chaves não permitidas', async () => {
    await expect(settingsService.setMany({ chave_invalida: 'valor' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita chave max_active_payment_links com valor numérico positivo', async () => {
    vi.mocked(settingsRepository.setMany).mockResolvedValueOnce(undefined as any);
    vi.mocked(settingsRepository.getAll).mockResolvedValueOnce({ max_active_payment_links: '5' });

    const result = await settingsService.setMany({ max_active_payment_links: '5' });
    expect(result).toEqual({ max_active_payment_links: '5' });
  });

  it('rejeita max_active_payment_links com valor não numérico', async () => {
    await expect(settingsService.setMany({ max_active_payment_links: 'abc' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita max_active_payment_links com valor zero ou negativo', async () => {
    await expect(settingsService.setMany({ max_active_payment_links: '0' }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(settingsService.setMany({ max_active_payment_links: '-1' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
