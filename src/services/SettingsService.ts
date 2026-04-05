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
