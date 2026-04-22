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

describe('chaves de pagamento parcial', () => {
  beforeEach(() => {
    vi.mocked(settingsRepository.setMany).mockResolvedValue(undefined as any);
    vi.mocked(settingsRepository.getAll).mockResolvedValue({});
  });

  it('aceita partial_payment_enabled = "true"', async () => {
    await expect(settingsService.setMany({ partial_payment_enabled: 'true' })).resolves.toBeDefined();
  });

  it('aceita partial_payment_enabled = "false"', async () => {
    await expect(settingsService.setMany({ partial_payment_enabled: 'false' })).resolves.toBeDefined();
  });

  it('rejeita partial_payment_enabled com valor inválido', async () => {
    await expect(settingsService.setMany({ partial_payment_enabled: 'maybe' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita partial_payment_min_amount decimal positivo', async () => {
    await expect(settingsService.setMany({ partial_payment_min_amount: '10.00' })).resolves.toBeDefined();
  });

  it('rejeita partial_payment_min_amount <= 0', async () => {
    await expect(settingsService.setMany({ partial_payment_min_amount: '0' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(settingsService.setMany({ partial_payment_min_amount: '-5' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita partial_payment_min_remaining decimal >= 0', async () => {
    await expect(settingsService.setMany({ partial_payment_min_remaining: '5.00' })).resolves.toBeDefined();
    await expect(settingsService.setMany({ partial_payment_min_remaining: '0' })).resolves.toBeDefined();
  });

  it('rejeita partial_payment_min_remaining negativo', async () => {
    await expect(settingsService.setMany({ partial_payment_min_remaining: '-1' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita payment_webhook_url https válida', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: 'https://example.com/hook' })).resolves.toBeDefined();
  });

  it('aceita payment_webhook_url vazia', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: '' })).resolves.toBeDefined();
  });

  it('rejeita payment_webhook_url http puro', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: 'http://example.com' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita payment_webhook_url inválida', async () => {
    await expect(settingsService.setMany({ payment_webhook_url: 'not-a-url' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita payment_webhook_secret com >= 16 chars', async () => {
    await expect(settingsService.setMany({ payment_webhook_secret: 'a'.repeat(16) })).resolves.toBeDefined();
  });

  it('rejeita payment_webhook_secret curto', async () => {
    await expect(settingsService.setMany({ payment_webhook_secret: 'short' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
