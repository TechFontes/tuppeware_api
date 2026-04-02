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
