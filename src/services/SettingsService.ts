import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import settingsRepository from '../repositories/SettingsRepository';

const ALLOWED_SETTINGS: Record<string, (value: string) => boolean> = {
  max_active_payment_links: (v) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n > 0;
  },
  fee_rate: (v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0 && n <= 1;
  },
  pix_expiration_hours: (v) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n > 0;
  },
  partial_payment_enabled: (v) => v === 'true' || v === 'false',
  partial_payment_min_amount: (v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
  },
  partial_payment_min_remaining: (v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n >= 0;
  },
  payment_webhook_url: (v) => {
    if (v === '') return true;
    try {
      const u = new URL(v);
      return u.protocol === 'https:';
    } catch {
      return false;
    }
  },
  payment_webhook_secret: (v) => typeof v === 'string' && v.length >= 16,
};

class SettingsService {
  async getAll(): Promise<Record<string, string>> {
    return settingsRepository.getAll();
  }

  async setMany(settings: Record<string, string>): Promise<Record<string, string>> {
    for (const [key, value] of Object.entries(settings)) {
      const validator = ALLOWED_SETTINGS[key];
      if (!validator) {
        throw new AppError(`Configuração '${key}' não é permitida.`, StatusCodes.BAD_REQUEST);
      }
      if (!validator(value)) {
        throw new AppError(`Valor inválido para '${key}': ${value}`, StatusCodes.BAD_REQUEST);
      }
    }

    await settingsRepository.setMany(settings);
    return settingsRepository.getAll();
  }
}

export default new SettingsService();
