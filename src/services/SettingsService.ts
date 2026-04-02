import settingsRepository from '../repositories/SettingsRepository';

class SettingsService {
  async getAll(): Promise<Record<string, string>> {
    return settingsRepository.getAll();
  }

  async setMany(settings: Record<string, string>): Promise<Record<string, string>> {
    await settingsRepository.setMany(settings);
    return settingsRepository.getAll();
  }
}

export default new SettingsService();
