import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/SavedCardService', () => ({
  default: { syncFromWebhook: vi.fn() },
}));

vi.mock('../../../services/ERedeService', () => ({
  default: { queryTransaction: vi.fn(), mapStatusToLocal: vi.fn() },
}));

vi.mock('../../../repositories/PaymentRepository', () => ({
  default: { updateByTid: vi.fn() },
}));

import eredeWebhookService from '../../../services/EredeWebhookService';
import savedCardService from '../../../services/SavedCardService';
import eRedeService from '../../../services/ERedeService';
import paymentRepository from '../../../repositories/PaymentRepository';

beforeEach(() => { vi.clearAllMocks(); });

describe('EredeWebhookService.syncTokenization', () => {
  it('delega para SavedCardService.syncFromWebhook', async () => {
    vi.mocked(savedCardService.syncFromWebhook).mockResolvedValueOnce(undefined);

    await eredeWebhookService.syncTokenization('tok-uuid');

    expect(savedCardService.syncFromWebhook).toHaveBeenCalledWith('tok-uuid');
  });
});

describe('EredeWebhookService.syncTransaction', () => {
  it('busca transação na Rede, mapeia status e atualiza payment', async () => {
    vi.mocked(eRedeService.queryTransaction).mockResolvedValueOnce({
      tid: 'tid-1', returnCode: '00', returnMessage: 'OK', status: 0, amount: 1000, reference: 'TPW-1', raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.updateByTid).mockResolvedValueOnce({ id: 'p1', status: 'PAGO' } as any);

    await eredeWebhookService.syncTransaction('tid-1');

    expect(eRedeService.queryTransaction).toHaveBeenCalledWith('tid-1');
    expect(paymentRepository.updateByTid).toHaveBeenCalledWith('tid-1', expect.objectContaining({ status: 'PAGO' }));
  });

  it('ignora silenciosamente quando payment não encontrado', async () => {
    vi.mocked(eRedeService.queryTransaction).mockResolvedValueOnce({
      tid: 'tid-x', returnCode: '00', returnMessage: 'OK', status: 0, amount: 1000, reference: 'r', raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.updateByTid).mockResolvedValueOnce(null);

    // não lança
    await eredeWebhookService.syncTransaction('tid-x');
  });
});
