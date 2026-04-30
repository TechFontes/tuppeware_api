import savedCardService from './SavedCardService';
import eRedeService from './ERedeService';
import paymentRepository from '../repositories/PaymentRepository';

class EredeWebhookService {
  async syncTokenization(tokenizationId: string): Promise<void> {
    await savedCardService.syncFromWebhook(tokenizationId);
  }

  async syncTransaction(tid: string): Promise<void> {
    const remote = await eRedeService.queryTransaction(tid);
    const localStatus = eRedeService.mapStatusToLocal(remote.returnCode, remote.status);

    await paymentRepository.updateByTid(tid, {
      status: localStatus,
      gatewayStatusCode: remote.returnCode,
      gatewayStatusMessage: remote.returnMessage,
    });
  }
}

export default new EredeWebhookService();
