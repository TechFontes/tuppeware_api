import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/PaymentRepository', () => ({
  default: {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByGatewayTransactionId: vi.fn(),
    findByReferenceNum: vi.fn(),
    countPendingByUser: vi.fn(),
  },
}));

vi.mock('../../../repositories/DebtRepository', () => ({
  default: { findByIds: vi.fn(), findById: vi.fn(), updateMany: vi.fn(), updateDebtPaidAmount: vi.fn() },
}));

vi.mock('../../../services/WebhookDispatcher', () => ({ default: { send: vi.fn() } }));

vi.mock('../../../services/ERedeService', () => ({
  default: {
    buildPixPayload: vi.fn().mockReturnValue({ kind: 'Pix', reference: 'TPW-mock', amount: 10000, qrCode: { dateTimeExpiration: '2026-05-04T00:38:48' } }),
    buildCreditPayload: vi.fn().mockReturnValue({ kind: 'credit' }),
    createTransaction: vi.fn(),
    validateCallbackSignature: vi.fn(),
    mapStatusToLocal: vi.fn(),
  },
}));

vi.mock('../../../services/WebSocketService', () => ({
  default: { emitToUser: vi.fn() },
}));

vi.mock('../../../services/SavedCardService', () => ({
  default: { tokenizeAndSave: vi.fn(), assertActiveForCharge: vi.fn() },
}));

vi.mock('../../../repositories/SettingsRepository', () => ({
  default: { get: vi.fn().mockResolvedValue('5'), getAll: vi.fn() },
}));

vi.mock('../../../repositories/UserRepository', () => ({
  default: { findById: vi.fn() },
}));

vi.mock('../../../repositories/SavedCardRepository', () => ({
  default: { findById: vi.fn() },
}));

vi.mock('../../../services/DebtService', () => ({
  default: { getByIdForUser: vi.fn() },
}));

import paymentService from '../../../services/PaymentService';
import paymentRepository from '../../../repositories/PaymentRepository';
import debtRepository from '../../../repositories/DebtRepository';
import eRedeService from '../../../services/ERedeService';
import webSocketService from '../../../services/WebSocketService';
import savedCardService from '../../../services/SavedCardService';
import settingsRepository from '../../../repositories/SettingsRepository';
import userRepository from '../../../repositories/UserRepository';
import debtService from '../../../services/DebtService';
import webhookDispatcher from '../../../services/WebhookDispatcher';

const makeDebt = (id: string, status = 'PENDENTE', valor = 150) => ({
  id, codigo: 'C001', nome: 'Consultora Test', grupo: 'G1', distrito: 'D1',
  semana: 'S01', valor: String(valor), diasAtraso: 0,
  dataVencimento: new Date(), numeroNf: `NF-${id}`,
  status, createdAt: new Date(), updatedAt: new Date(), paymentDebts: [],
});

const makePayment = (id = 'p1', status = 'PENDENTE', method = 'PIX') => ({
  id, userId: 'user-uuid-1', method, installments: 1,
  subtotal: 150, fee: 0, totalValue: 150, status,
  gatewayProvider: 'EREDE',
  referenceNum: `TPW-${Date.now()}-user-uui`,
  gatewayTransactionId: 'tid-abc', gatewayOrderId: null,
  gatewayStatusCode: '00', gatewayStatusMessage: 'Aprovado',
  processorReference: null,
  paymentLink: 'https://pix.link/qr', qrCode: '00020126...',
  callbackPayload: null, createdAt: new Date(), updatedAt: new Date(),
  paymentDebts: [{ debtId: 'd1' }],
});

const billingBase = {
  name: 'Test User', email: 'test@email.com', phone: '11999999999',
  document: '11144477735', birthDate: '1990-01-01', address: 'Rua Exemplo',
  district: 'Centro', city: 'São Paulo', state: 'SP', postalcode: '01310100',
};

const cardBase = {
  number: '4111111111111111', expMonth: '12', expYear: '2028',
  cvv: '123', holderName: 'TEST USER',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  vi.mocked(paymentRepository.countPendingByUser).mockResolvedValue(0);
  vi.mocked(eRedeService.createTransaction).mockResolvedValue({
    tid: 'tid-abc', returnCode: '00', returnMessage: 'Aprovado', reference: 'TPW-mock',
    pix: { qrCodeData: '00020126...', qrCodeImage: 'iVBOR...', dateTimeExpiration: '2026-05-04T00:38:48' },
    raw: {},
  });
  vi.mocked(paymentRepository.create).mockResolvedValue(makePayment() as any);
  // update is called by updateStatusByGatewayCode (via updateStatus) after create
  vi.mocked(paymentRepository.update).mockResolvedValue(makePayment('p1', 'PAGO') as any);
  vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
});

describe('PaymentService.create — validação de débitos', () => {
  it('lança 400 quando nenhum débito é encontrado', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([]);
    await expect(paymentService.create('user-uuid-1', { debtIds: ['nao-existe'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 quando número de débitos retornados difere dos solicitados', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    await expect(paymentService.create('user-uuid-1', { debtIds: ['d1', 'd2'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 quando algum débito está PAGO', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PAGO') as any]);
    await expect(paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });
});

describe('PaymentService.create — regras de parcelamento (RF-14)', () => {
  it('lança 400: subtotal < R$300 com installments > 1', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 100) as any]);
    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'], method: 'CARTAO_CREDITO', installments: 2, card: cardBase, billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400: total com fee entre R$300-499 com installments > 2', async () => {
    // subtotal=286, fee=5%≈14.3, total≈300.3 → entre 300 e 499
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 286) as any]);
    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'], method: 'CARTAO_CREDITO', installments: 3, card: cardBase, billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400: total >= R$500 com installments > 3', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);
    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'], method: 'CARTAO_CREDITO', installments: 4, card: cardBase, billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('aceita: total >= R$500 com installments = 3', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);
    const result = await paymentService.create('user-uuid-1', {
      debtIds: ['d1'], method: 'CARTAO_CREDITO', installments: 3, card: cardBase, billing: billingBase,
    });
    expect(result).toBeDefined();
  });
});

describe('PaymentService.create — cálculo de fee (RF-13)', () => {
  it('aplica fee de 5% para cartão de crédito', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);
    let capturedFee: number | undefined;
    let capturedTotal: number | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedFee = data.fee;
      capturedTotal = data.totalValue;
      return makePayment() as any;
    });
    await paymentService.create('user-uuid-1', {
      debtIds: ['d1'], method: 'CARTAO_CREDITO', installments: 1, card: cardBase, billing: billingBase,
    });
    expect(capturedFee).toBeCloseTo(25);
    expect(capturedTotal).toBeCloseTo(525);
  });

  it('fee é zero para PIX', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 150) as any]);
    let capturedFee: number | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedFee = data.fee;
      return makePayment() as any;
    });
    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });
    expect(capturedFee).toBe(0);
  });
});

describe('PaymentService.create — limite de links ativos (RF-16)', () => {
  it('lança 429 quando usuário atingiu limite de 5 links ativos', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(paymentRepository.countPendingByUser).mockResolvedValueOnce(5);
    await expect(paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase }))
      .rejects.toMatchObject({ statusCode: StatusCodes.TOO_MANY_REQUESTS });
  });

  it('prossegue quando usuário tem menos que o limite', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(paymentRepository.countPendingByUser).mockResolvedValueOnce(4);
    const result = await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });
    expect(result).toBeDefined();
  });
});

describe('PaymentService.create — referenceNum (RF-17)', () => {
  it('referenceNum segue formato TPW-{timestamp}-{userId[0:8]}', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    let capturedRef: string | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedRef = data.referenceNum;
      return makePayment() as any;
    });
    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });
    expect(capturedRef).toMatch(/^TPW-\d+-user-uui$/);
  });
});

describe('PaymentService.create — PIX', () => {
  it('lança 400 se PIX tiver installments > 1', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'], method: 'PIX', installments: 2, billing: billingBase,
    })).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('emite evento WebSocket payment:created após sucesso', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });
    expect(webSocketService.emitToUser).toHaveBeenCalledWith(
      'user-uuid-1', 'payment:created', expect.objectContaining({ paymentId: 'p1' }),
    );
  });
});

describe('PaymentService.processGatewayCallback', () => {
  it('lança 400 se assinatura inválida', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(false);
    await expect(paymentService.processGatewayCallback({ tid: '', returnCode: '', status: 0, reference: '', amount: 0 }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 se nem tid nem reference estão presentes', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    await expect(paymentService.processGatewayCallback({ tid: '', returnCode: '00', status: 0, reference: '', amount: 0 }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('é idempotente quando status não mudou', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    // payment already has status=PAGO and gatewayStatusCode='00'
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(makePayment('p1', 'PAGO') as any);
    const result = await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '00', status: 0, reference: 'TPW-1', amount: 1000 });
    expect(paymentRepository.update).not.toHaveBeenCalled();
    expect(result.id).toBe('p1');
  });

  it('atualiza débitos para PAGO quando pagamento fica PAGO', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(
      { ...makePayment('p1', 'PENDENTE'), gatewayStatusCode: '99' } as any,
    );
    vi.mocked(paymentRepository.update).mockResolvedValueOnce(
      { ...makePayment('p1', 'PAGO'), paymentDebts: [{ debtId: 'd1' }, { debtId: 'd2' }] } as any,
    );
    await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '00', status: 0, reference: 'TPW-1', amount: 1000 });
    expect(debtRepository.updateMany).toHaveBeenCalledWith({ id: { in: ['d1', 'd2'] } }, { status: 'PAGO' });
  });

  it('reverte débitos para PENDENTE quando status do callback é CANCELADO', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('CANCELADO');
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(
      { ...makePayment('p1', 'PENDENTE'), gatewayStatusCode: '99' } as any,
    );
    vi.mocked(paymentRepository.update).mockResolvedValueOnce(
      { ...makePayment('p1', 'CANCELADO'), paymentDebts: [{ debtId: 'd1' }, { debtId: 'd2' }] } as any,
    );
    await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '04', status: 4, reference: 'TPW-1', amount: 1000 });
    expect(debtRepository.updateMany).toHaveBeenCalledWith({ id: { in: ['d1', 'd2'] } }, { status: 'PENDENTE' });
  });

  it('emite payment:updated via WebSocket após atualização', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('CANCELADO');
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValueOnce(
      { ...makePayment('p1', 'PENDENTE'), gatewayStatusCode: '99' } as any,
    );
    vi.mocked(paymentRepository.update).mockResolvedValueOnce(makePayment('p1', 'CANCELADO') as any);
    await paymentService.processGatewayCallback({ tid: 'tid-abc', returnCode: '04', status: 4, reference: 'TPW-1', amount: 1000 });
    expect(webSocketService.emitToUser).toHaveBeenCalledWith(
      'user-uuid-1', 'payment:updated', expect.objectContaining({ status: 'CANCELADO' }),
    );
  });
});

describe('PaymentService.reopenPayment', () => {
  it('lança 404 quando pagamento não existe', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce(null);
    await expect(paymentService.reopenPayment('user-uuid-1', 'nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('lança 403 quando pagamento pertence a outro usuário', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce({ ...makePayment(), userId: 'outro-user' } as any);
    await expect(paymentService.reopenPayment('user-uuid-1', 'p1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });

  it('lança 400 quando pagamento não está PENDENTE', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce(makePayment('p1', 'PAGO') as any);
    await expect(paymentService.reopenPayment('user-uuid-1', 'p1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 ao tentar reabrir CARTAO_CREDITO expirado (criado ontem)', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce({
      ...makePayment('p1', 'PENDENTE', 'CARTAO_CREDITO'),
      method: 'CARTAO_CREDITO', createdAt: yesterday,
    } as any);
    await expect(paymentService.reopenPayment('user-uuid-1', 'p1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('retorna link PIX existente sem nova transação quando criado hoje', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce({
      ...makePayment('p1', 'PENDENTE', 'PIX'),
      method: 'PIX', createdAt: new Date(),
    } as any);
    const result = await paymentService.reopenPayment('user-uuid-1', 'p1');
    expect(eRedeService.createTransaction).not.toHaveBeenCalled();
    expect(result.checkoutUrl).toBe('https://pix.link/qr');
    expect((result as any).reopened).toBe(false);
  });
});

describe('PaymentService.reopenPayment — PIX expirado cria nova transação', () => {
  it('cria nova transação PIX quando link PIX expirou (criado ontem)', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    vi.mocked(paymentRepository.findById).mockResolvedValueOnce({
      ...makePayment('p1', 'PENDENTE', 'PIX'),
      method: 'PIX',
      createdAt: yesterday,
      totalValue: 150,
    } as any);
    vi.mocked(eRedeService.buildPixPayload).mockReturnValueOnce({ kind: 'Pix', reference: 'TPW-new', amount: 15000, qrCode: { dateTimeExpiration: '2026-05-04T00:38:48' } });
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-new', returnCode: '00', returnMessage: 'OK', reference: 'TPW-new',
      pix: { qrCodeData: 'qr-code-new', qrCodeImage: 'iVBOR...', dateTimeExpiration: '2026-05-04T00:38:48' },
      raw: {},
    });
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({
      ...makePayment('p1', 'PENDENTE', 'PIX'),
      paymentLink: 'https://pix.link/new',
      qrCode: 'qr-code-new',
    } as any);

    const result = await paymentService.reopenPayment('user-uuid-1', 'p1');

    expect(eRedeService.createTransaction).toHaveBeenCalled();
    expect(paymentRepository.update).toHaveBeenCalled();
    expect((result as any).reopened).toBe(true);
  });
});

describe('PaymentService.create — atomicidade via status na criação (CRIT-03)', () => {
  it('NÃO chama paymentRepository.update durante create (status definido na criação)', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce(makePayment('p1', 'PAGO') as any);

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(paymentRepository.update).not.toHaveBeenCalled();
  });

  it('passa status correto para paymentRepository.create quando gateway aprova', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    let capturedStatus: string | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedStatus = data.status;
      return makePayment('p1', 'PAGO') as any;
    });

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(capturedStatus).toBe('PAGO');
  });

  it('passa status PENDENTE para paymentRepository.create quando gateway retorna pendente', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-pix', returnCode: '57', returnMessage: 'Pendente', reference: 'TPW-mock',
      pix: { qrCodeData: '00020126...', qrCodeImage: 'iVBOR...', dateTimeExpiration: '2026-05-04T00:38:48' },
      raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PENDENTE');
    let capturedStatus: string | undefined;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedStatus = data.status;
      return makePayment('p1', 'PENDENTE') as any;
    });

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(capturedStatus).toBe('PENDENTE');
    expect(paymentRepository.update).not.toHaveBeenCalled();
  });

  it('atualiza débitos para PAGO quando status inicial é PAGO', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce(makePayment('p1', 'PAGO') as any);

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(debtRepository.updateMany).toHaveBeenCalledWith({ id: { in: ['d1'] } }, { status: 'PAGO' });
  });

  it('NÃO atualiza débitos quando status inicial é PENDENTE', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1') as any]);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-pix', returnCode: '57', returnMessage: 'Pendente', reference: 'TPW-mock',
      pix: { qrCodeData: '00020126...', qrCodeImage: 'iVBOR...', dateTimeExpiration: '2026-05-04T00:38:48' },
      raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PENDENTE');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce(makePayment('p1', 'PENDENTE') as any);

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(debtRepository.updateMany).not.toHaveBeenCalled();
  });
});

describe('PaymentService.updateStatus', () => {
  it('atualiza status para PAGO e marca débitos como pagos', async () => {
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({
      id: 'pay-1', userId: 'user-1', status: 'PAGO',
      paymentDebts: [{ debtId: 'debt-1' }, { debtId: 'debt-2' }],
    } as any);
    vi.mocked(debtRepository.updateMany).mockResolvedValueOnce({ count: 2 } as any);

    await paymentService.updateStatus('pay-1', 'PAGO');

    expect(debtRepository.updateMany).toHaveBeenCalledWith(
      { id: { in: ['debt-1', 'debt-2'] } },
      { status: 'PAGO' },
    );
    expect(webSocketService.emitToUser).toHaveBeenCalledWith('user-1', 'payment:updated', expect.any(Object));
  });

  it('não atualiza débitos quando status é PENDENTE', async () => {
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({
      id: 'pay-1', userId: 'user-1', status: 'PENDENTE',
      paymentDebts: [{ debtId: 'debt-1' }],
    } as any);

    await paymentService.updateStatus('pay-1', 'PENDENTE');

    expect(debtRepository.updateMany).not.toHaveBeenCalled();
    expect(webSocketService.emitToUser).toHaveBeenCalledWith('user-1', 'payment:updated', expect.any(Object));
  });

  it('reverte débitos para PENDENTE quando status é CANCELADO', async () => {
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({
      id: 'pay-1', userId: 'user-1', status: 'CANCELADO',
      paymentDebts: [{ debtId: 'debt-1' }, { debtId: 'debt-2' }],
    } as any);

    await paymentService.updateStatus('pay-1', 'CANCELADO');

    expect(debtRepository.updateMany).toHaveBeenCalledWith(
      { id: { in: ['debt-1', 'debt-2'] } },
      { status: 'PENDENTE' },
    );
    expect(webSocketService.emitToUser).toHaveBeenCalledWith('user-1', 'payment:updated', expect.any(Object));
  });
});

describe('PaymentService.listPaidDocuments', () => {
  beforeEach(() => {
    // findMany is not in the original mock definition; add it at runtime
    if (!(paymentRepository as any).findMany) {
      (paymentRepository as any).findMany = vi.fn();
    } else {
      vi.mocked((paymentRepository as any).findMany).mockReset();
    }
  });

  it('lista pagamentos com status PAGO', async () => {
    vi.mocked((paymentRepository as any).findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await paymentService.listPaidDocuments({ page: 1, limit: 10, skip: 0 });

    const call = vi.mocked((paymentRepository as any).findMany).mock.calls[0][0];
    expect((call.where as any).status).toBe('PAGO');
  });

  it('aplica filtro de dataInicio quando fornecido', async () => {
    vi.mocked((paymentRepository as any).findMany).mockResolvedValueOnce({ data: [], total: 0 });

    await paymentService.listPaidDocuments({ dataInicio: '2024-01-01', page: 1, limit: 10, skip: 0 });

    const call = vi.mocked((paymentRepository as any).findMany).mock.calls[0][0];
    expect((call.where as any).createdAt).toBeDefined();
  });
});

describe('PaymentService.processGatewayCallback — busca por reference quando tid está vazio', () => {
  it('usa findByReferenceNum quando tid está vazio mas reference tem valor', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.findByReferenceNum).mockResolvedValueOnce(
      { ...makePayment('p1', 'PENDENTE'), gatewayStatusCode: '99' } as any,
    );
    vi.mocked(paymentRepository.update).mockResolvedValueOnce(makePayment('p1', 'PAGO') as any);

    await paymentService.processGatewayCallback({ tid: '', returnCode: '00', status: 0, reference: 'TPW-ref-1', amount: 1000 });

    expect(paymentRepository.findByReferenceNum).toHaveBeenCalledWith('TPW-ref-1');
    expect(paymentRepository.findByGatewayTransactionId).not.toHaveBeenCalled();
  });

  it('lança 404 quando pagamento não é encontrado por reference', async () => {
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValueOnce(true);
    vi.mocked(paymentRepository.findByReferenceNum).mockResolvedValueOnce(null);

    await expect(
      paymentService.processGatewayCallback({ tid: '', returnCode: '00', status: 0, reference: 'TPW-inexistente', amount: 0 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('PaymentService._validateInstallments — faixa R$300–R$499 e parcelas inválidas', () => {
  it('lança 400 quando subtotal está entre R$300 e R$499 com installments > 2', async () => {
    // subtotal=400, com 5% fee = 420 → total >= 300 e < 500; installments=3 excede limite de 2
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 400) as any]);

    await expect(
      paymentService.create('user-uuid-1', {
        debtIds: ['d1'],
        method: 'CARTAO_CREDITO',
        installments: 3,
        card: cardBase,
        billing: billingBase,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('lança 400 quando installments é 0 (número de parcelas inválido)', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 500) as any]);

    await expect(
      paymentService.create('user-uuid-1', {
        debtIds: ['d1'],
        method: 'CARTAO_CREDITO',
        installments: 0,
        card: cardBase,
        billing: billingBase,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('PaymentService.create — parcelamento baseado no subtotal (CRIT-04)', () => {
  // subtotal = 285, totalValue com 5% fee = 299.25 (< 300)
  // subtotal = 285 → max 1 parcela. Passando installments=2 deve falhar.
  it('rejeita 2 parcelas quando subtotal é R$285 (< R$300), mesmo que totalValue seja próximo de R$300', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([
      makeDebt('d1', 'PENDENTE', 285) as any,
    ]);

    await expect(
      paymentService.create('user-uuid-1', {
        debtIds: ['d1'],
        method: 'CARTAO_CREDITO',
        installments: 2,
        card: cardBase,
        billing: billingBase,
      }),
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  // subtotal = 290, totalValue = 290 * 1.05 = 304.5 (>= 300)
  // Com o bug (totalValue): 304.5 >= 300, installments=2 seria ACEITO → bug
  // Com o fix (subtotal): 290 < 300, installments=2 deve ser REJEITADO → correto
  it('rejeita 2 parcelas quando subtotal é R$290 mesmo que totalValue com taxa ultrapasse R$300', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([
      makeDebt('d1', 'PENDENTE', 290) as any,
    ]);

    await expect(
      paymentService.create('user-uuid-1', {
        debtIds: ['d1'],
        method: 'CARTAO_CREDITO',
        installments: 2,
        card: cardBase,
        billing: billingBase,
      }),
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  // subtotal = 300, totalValue = 300 * 1.05 = 315 → installments=2 deve ser ACEITO
  it('aceita 2 parcelas quando subtotal é exatamente R$300', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([
      makeDebt('d1', 'PENDENTE', 300) as any,
    ]);
    vi.mocked(eRedeService.buildCreditPayload).mockReturnValueOnce({ kind: 'credit' } as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-ok', returnCode: '00', returnMessage: 'Aprovado', reference: 'ref-ok',
    } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce(makePayment('pay-1') as any);

    const result = await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 2,
      card: cardBase,
      billing: billingBase,
    });
    expect(result).toBeDefined();
  });
});

describe('PaymentService.create — pagamento com savedCardId (RF-29)', () => {
  const savedCard = {
    id: 'saved-card-1', userId: 'user-uuid-1', tokenizationId: 'tok_saved_abc',
    cardBrand: 'VISA', lastFour: '4242', holderName: 'SAVED USER', status: 'ACTIVE',
    createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.mocked(debtRepository.findByIds).mockResolvedValue([makeDebt('d1', 'PENDENTE', 100) as any]);
    vi.mocked(eRedeService.buildCreditPayload).mockReturnValue({ kind: 'credit' } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValue(makePayment('p1', 'PAGO', 'CARTAO_CREDITO') as any);
    vi.mocked(paymentRepository.update).mockResolvedValue({ id: 'p1' } as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('cria pagamento usando tokenizationId do cartão salvo', async () => {
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce(savedCard as any);

    await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      card: { number: '', expMonth: '', expYear: '', cvv: '123', holderName: '' },
      billing: billingBase,
    });

    expect(eRedeService.buildCreditPayload).toHaveBeenCalledWith(
      expect.objectContaining({ cardToken: 'tok_saved_abc' }),
    );
  });

  it('lança 404 quando savedCardId não existe (assertActiveForCharge propaga)', async () => {
    vi.mocked(savedCardService.assertActiveForCharge).mockRejectedValueOnce(
      Object.assign(new Error('Cartão salvo não encontrado.'), { statusCode: 404 }),
    );

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'card-inexistente',
      card: { number: '', expMonth: '', expYear: '', cvv: '123', holderName: '' },
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lança 403 quando cartão salvo pertence a outro usuário (assertActiveForCharge propaga)', async () => {
    vi.mocked(savedCardService.assertActiveForCharge).mockRejectedValueOnce(
      Object.assign(new Error('Acesso negado ao cartão salvo.'), { statusCode: 403 }),
    );

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      card: { number: '', expMonth: '', expYear: '', cvv: '123', holderName: '' },
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lança 400 quando savedCardId presente mas cvv ausente', async () => {
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce(savedCard as any);

    await expect(paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      billing: billingBase,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('usa holderName do cartão salvo no payload', async () => {
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce(savedCard as any);

    await paymentService.create('user-uuid-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'saved-card-1',
      card: { number: '', expMonth: '', expYear: '', cvv: '456', holderName: '' },
      billing: billingBase,
    });

    expect(eRedeService.buildCreditPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({
          cvv: '456',
          holderName: 'SAVED USER',
        }),
      }),
    );
  });
});

describe('PaymentService.create — persiste nsu e authorizationCode do gateway', () => {
  it('create: persiste nsu e authorizationCode retornados pelo gateway', async () => {
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([makeDebt('d1', 'PENDENTE', 150) as any]);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-1',
      returnCode: '00',
      returnMessage: 'OK',
      reference: 'TPW-mock',
      nsu: '123456',
      authorizationCode: '789012',
      pix: { qrCodeData: 'QR', qrCodeImage: '', dateTimeExpiration: '' },
      raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');

    let capturedCreate: any;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedCreate = data;
      return makePayment() as any;
    });

    await paymentService.create('user-uuid-1', { debtIds: ['d1'], method: 'PIX', billing: billingBase });

    expect(capturedCreate).toMatchObject({
      nsu: '123456',
      authorizationCode: '789012',
    });
  });

  it('createPartial: persiste nsu retornado pelo gateway PIX', async () => {
    vi.mocked(settingsRepository.getAll).mockResolvedValueOnce({
      partial_payment_enabled: 'true',
      partial_payment_min_amount: '10',
      partial_payment_min_remaining: '5',
    });
    vi.mocked(debtService.getByIdForUser).mockResolvedValueOnce({
      id: 'd-1', valor: 100, paidAmount: 0, status: 'PENDENTE', codigo: '1234',
    } as any);
    vi.mocked(userRepository.findById).mockResolvedValueOnce({ id: 'user-1', cpf: '12345678900' } as any);
    vi.mocked(eRedeService.buildPixPayload).mockReturnValueOnce({} as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-pix',
      returnCode: '00',
      returnMessage: 'OK',
      nsu: '999888',
      raw: {},
    } as any);

    let capturedCreate: any;
    vi.mocked(paymentRepository.create).mockImplementationOnce(async (data: any) => {
      capturedCreate = data;
      return { id: 'p-new', referenceNum: 'TPW-1', qrCode: null } as any;
    });

    await paymentService.createPartial('user-1', { debtId: 'd-1', amount: 40 });

    expect(capturedCreate).toMatchObject({
      nsu: '999888',
    });
  });
});

describe('createPartial', () => {
  const userId = 'user-1';
  const baseDto = { debtId: 'd-1', amount: 40 };

  const mkDebt = (overrides: Partial<any> = {}) => ({
    id: 'd-1',
    valor: 100,
    paidAmount: 0,
    status: 'PENDENTE',
    codigo: '1234',
    ...overrides,
  });

  const setSettings = (overrides: Record<string, string> = {}) => {
    vi.mocked(settingsRepository.getAll).mockResolvedValue({
      partial_payment_enabled: 'true',
      partial_payment_min_amount: '10',
      partial_payment_min_remaining: '5',
      ...overrides,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setSettings();
    vi.mocked(debtService.getByIdForUser).mockResolvedValue(mkDebt() as any);
    vi.mocked(userRepository.findById).mockResolvedValue({ id: userId, cpf: '12345678900' } as any);
    vi.mocked(eRedeService.buildPixPayload).mockReturnValue({} as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValue({
      tid: 'tid-1',
      returnCode: '00',
      qrCode: 'QR-DATA',
    } as any);
    vi.mocked(paymentRepository.create).mockResolvedValue({
      id: 'p-1',
      referenceNum: 'TPW-1',
      qrCode: 'QR-DATA',
    } as any);
  });

  it('cria parcial com valores válidos e retorna QR code', async () => {
    const result = await paymentService.createPartial(userId, baseDto);
    expect(result).toMatchObject({ paymentId: 'p-1', qrCode: 'QR-DATA' });
    expect(paymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isPartial: true,
        subtotal: 40,
        fee: 0,
        totalValue: 40,
        method: 'PIX',
        installments: 1,
      }),
    );
  });

  it('bloqueia com 403 quando feature desabilitada', async () => {
    setSettings({ partial_payment_enabled: 'false' });
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('retorna 404 quando dívida não encontrada', async () => {
    vi.mocked(debtService.getByIdForUser).mockResolvedValue(null as any);
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('retorna 400 quando dívida já está PAGA', async () => {
    vi.mocked(debtService.getByIdForUser).mockResolvedValue(mkDebt({ status: 'PAGO' }) as any);
    await expect(paymentService.createPartial(userId, baseDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna 400 quando amount < min_amount', async () => {
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 5 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna 400 quando amount > restante', async () => {
    vi.mocked(debtService.getByIdForUser).mockResolvedValue(mkDebt({ paidAmount: 70 }) as any);
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 40 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna 400 quando restante após o parcial viola min_remaining (ex: sobra 2 com min 5)', async () => {
    // debt 100, paid 0, amount 98 -> sobra 2, min_remaining 5 -> rejeita
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 98 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('permite amount == restante (quita exato, remainingAfter = 0)', async () => {
    vi.mocked(debtService.getByIdForUser).mockResolvedValue(mkDebt({ paidAmount: 60 }) as any);
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 40 })).resolves.toBeDefined();
  });

  it('permite restante igual a min_remaining', async () => {
    // debt 100, paid 0, amount 95 -> sobra 5, min_remaining 5 -> ok (>=)
    await expect(paymentService.createPartial(userId, { debtId: 'd-1', amount: 95 })).resolves.toBeDefined();
  });

  it('retorna 404 quando dívida existe mas fora do escopo do usuário', async () => {
    vi.mocked(debtService.getByIdForUser).mockResolvedValue(null as any);
    await expect(
      paymentService.createPartial('u-1', { debtId: 'd-of-other', amount: 40 }, { id: 'u-1', role: 'CONSULTOR', cpf: '111' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('processGatewayCallback — parcial + webhook', () => {
  beforeEach(async () => {
    // Drena setImmediate pendentes de testes anteriores antes de limpar mocks
    await new Promise((r) => setImmediate(r));
    vi.clearAllMocks();
    vi.mocked(webhookDispatcher.send).mockResolvedValue(undefined);
    vi.mocked(userRepository.findById).mockResolvedValue({ id: 'u-1', cpf: '12345678900' } as any);
    vi.mocked(eRedeService.validateCallbackSignature).mockReturnValue(true);
  });

  const mkPartialPayment = (overrides: Partial<any> = {}) => ({
    id: 'p-1',
    referenceNum: 'TPW-R1',
    totalValue: 40,
    isPartial: true,
    status: 'PENDENTE',
    userId: 'u-1',
    method: 'PIX',
    gatewayStatusCode: '99',
    gatewayTransactionId: null,
    paymentDebts: [
      {
        debtId: 'd-1',
        debt: { id: 'd-1', codigo: '1234', valor: 100, paidAmount: 0, status: 'PENDENTE' },
      },
    ],
    ...overrides,
  });

  const mkFullPayment = () => ({
    id: 'p-full',
    referenceNum: 'TPW-RF',
    totalValue: 100,
    isPartial: false,
    status: 'PENDENTE',
    userId: 'u-1',
    method: 'PIX',
    gatewayStatusCode: '99',
    gatewayTransactionId: null,
    paymentDebts: [
      { debtId: 'd-1', debt: { id: 'd-1', codigo: '1234', valor: 100, paidAmount: 0, status: 'PENDENTE' } },
    ],
  });

  it('callback de parcial confirmado: soma paidAmount, mantém PENDENTE, dispara webhook PARTIAL', async () => {
    const payment = mkPartialPayment();
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.findByReferenceNum).mockResolvedValue(payment as any);
    vi.mocked(paymentRepository.update).mockResolvedValue({ ...payment, status: 'PAGO' } as any);
    vi.mocked(debtRepository.updateDebtPaidAmount).mockResolvedValue(true);

    await paymentService.processGatewayCallback({
      reference: 'TPW-R1',
      returnCode: '00',
      tid: '',
      status: 0,
      amount: 4000,
    } as any);

    // paidAmount 0 -> 40, não quita (40 < 100), mantém PENDENTE
    expect(debtRepository.updateDebtPaidAmount).toHaveBeenCalledWith(
      'd-1',
      expect.anything(),
      expect.anything(),
      'PENDENTE',
    );

    // Webhook async — aguarda setImmediate
    await new Promise((r) => setImmediate(r));
    expect(webhookDispatcher.send).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentType: 'PARTIAL',
        debt: expect.objectContaining({ paidAmount: 40, remaining: 60 }),
      }),
    );
  });

  it('callback do último parcial: quita (status PAGO) e dispara webhook', async () => {
    const payment = mkPartialPayment({
      id: 'p-2',
      referenceNum: 'TPW-R2',
      totalValue: 60,
      paymentDebts: [
        { debtId: 'd-1', debt: { id: 'd-1', codigo: '1234', valor: 100, paidAmount: 40, status: 'PENDENTE' } },
      ],
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.findByReferenceNum).mockResolvedValue(payment as any);
    vi.mocked(paymentRepository.update).mockResolvedValue({ ...payment, status: 'PAGO' } as any);
    vi.mocked(debtRepository.updateDebtPaidAmount).mockResolvedValue(true);

    await paymentService.processGatewayCallback({
      reference: 'TPW-R2',
      returnCode: '00',
      tid: '',
      status: 0,
      amount: 6000,
    } as any);

    expect(debtRepository.updateDebtPaidAmount).toHaveBeenCalledWith(
      'd-1',
      expect.anything(),
      expect.anything(),
      'PAGO',
    );
  });

  it('callback de pagamento TOTAL: preserva fluxo atual, dispara webhook FULL', async () => {
    const payment = mkFullPayment();
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('PAGO');
    vi.mocked(paymentRepository.findByReferenceNum).mockResolvedValue(payment as any);
    vi.mocked(paymentRepository.update).mockResolvedValue({
      ...payment,
      status: 'PAGO',
      paymentDebts: [{ debtId: 'd-1' }],
    } as any);
    vi.mocked(debtRepository.updateMany).mockResolvedValue({ count: 1 } as any);

    await paymentService.processGatewayCallback({
      reference: 'TPW-RF',
      returnCode: '00',
      tid: '',
      status: 0,
      amount: 10000,
    } as any);

    // NÃO deve chamar updateDebtPaidAmount em total (fluxo atual usa updateMany para marcar PAGO)
    expect(debtRepository.updateDebtPaidAmount).not.toHaveBeenCalled();

    await new Promise((r) => setImmediate(r));
    expect(webhookDispatcher.send).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: 'FULL' }),
    );
  });

  it('callback CANCELADO em parcial: NÃO mexe paidAmount e NÃO dispara webhook', async () => {
    const payment = mkPartialPayment({ id: 'p-cx', referenceNum: 'TPW-CX' });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValue('CANCELADO');
    vi.mocked(paymentRepository.findByReferenceNum).mockResolvedValue(payment as any);
    vi.mocked(paymentRepository.update).mockResolvedValue({
      ...payment,
      status: 'CANCELADO',
      paymentDebts: [{ debtId: 'd-1' }],
    } as any);
    vi.mocked(debtRepository.updateMany).mockResolvedValue({ count: 1 } as any);

    await paymentService.processGatewayCallback({
      reference: 'TPW-CX',
      returnCode: '99',
      status: 4,
      tid: '',
      amount: 0,
    } as any);

    expect(debtRepository.updateDebtPaidAmount).not.toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(webhookDispatcher.send).not.toHaveBeenCalled();
  });

  it('persiste nsu e authorizationCode quando vêm no callback', async () => {
    const payment = {
      id: 'p-nsu-1',
      referenceNum: 'TPW-NSU',
      totalValue: 40,
      isPartial: false,
      status: 'PENDENTE',
      userId: 'u-1',
      method: 'PIX',
      gatewayStatusCode: null,
      gatewayTransactionId: 'tid-nsu-1',
      paymentDebts: [
        { debtId: 'd-1', debt: { id: 'd-1', codigo: '1', valor: 100, paidAmount: 0, status: 'PENDENTE' } },
      ],
    };
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValue(payment as any);
    vi.mocked(paymentRepository.update).mockResolvedValue(payment as any);
    vi.mocked(debtRepository.updateMany).mockResolvedValue({ count: 1 } as any);

    await paymentService.processGatewayCallback({
      reference: 'TPW-NSU',
      returnCode: '00',
      tid: 'tid-nsu-1',
      nsu: 'NSU-999',
      authorizationCode: 'AUTH-123',
    } as any);

    expect(paymentRepository.update).toHaveBeenCalledWith(
      'p-nsu-1',
      expect.objectContaining({
        nsu: 'NSU-999',
        authorizationCode: 'AUTH-123',
      }),
    );
  });

  it('não sobrescreve nsu existente com undefined quando callback omite', async () => {
    const payment = {
      id: 'p-nsu-2',
      referenceNum: 'TPW-NSU2',
      totalValue: 40,
      isPartial: false,
      status: 'PENDENTE',
      userId: 'u-1',
      method: 'PIX',
      gatewayStatusCode: null,
      gatewayTransactionId: 'tid-nsu-2',
      nsu: 'NSU-OLD',
      authorizationCode: null,
      paymentDebts: [
        { debtId: 'd-2', debt: { id: 'd-2', codigo: '2', valor: 100, paidAmount: 0, status: 'PENDENTE' } },
      ],
    };
    vi.mocked(paymentRepository.findByGatewayTransactionId).mockResolvedValue(payment as any);
    vi.mocked(paymentRepository.update).mockResolvedValue(payment as any);
    vi.mocked(debtRepository.updateMany).mockResolvedValue({ count: 1 } as any);

    await paymentService.processGatewayCallback({
      reference: 'TPW-NSU2',
      returnCode: '00',
      tid: 'tid-nsu-2',
      // sem nsu/authorizationCode
    } as any);

    const updateCall = vi.mocked(paymentRepository.update).mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData).not.toHaveProperty('nsu', undefined);
  });
});

describe('PaymentService — exposição de nsu e authorizationCode nas respostas GET', () => {
  const mockPaymentWithNsuAndAuth = {
    id: 'payment-nsu-auth-1',
    userId: 'user-1',
    method: 'CARTAO_CREDITO',
    installments: 1,
    subtotal: 150,
    fee: 7.5,
    totalValue: 157.5,
    isPartial: false,
    status: 'PAGO',
    gatewayProvider: 'EREDE',
    referenceNum: 'TPW-123456-user-1',
    gatewayTransactionId: 'tid-xyz',
    gatewayOrderId: 'order-123',
    gatewayStatusCode: '00',
    gatewayStatusMessage: 'Aprovado',
    nsu: '123456789',
    authorizationCode: 'AUTH-ABC-123',
    processorReference: null,
    paymentLink: null,
    qrCode: null,
    callbackPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    paymentDebts: [{ debtId: 'debt-1' }],
  };

  it('getById retorna payment com nsu e authorizationCode', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(mockPaymentWithNsuAndAuth as any);

    const result = await paymentService.getById('user-1', 'payment-nsu-auth-1');

    expect(result).toHaveProperty('nsu', '123456789');
    expect(result).toHaveProperty('authorizationCode', 'AUTH-ABC-123');
  });

  it('getHistory retorna payments com nsu e authorizationCode', async () => {
    const mockPayments = [mockPaymentWithNsuAndAuth];
    vi.mocked(paymentRepository.findByUserId).mockResolvedValue({
      data: mockPayments as any,
      total: 1,
    });

    const result = await paymentService.getHistory('user-1', {});

    expect(result.data).toHaveLength(1);
    const payment = result.data[0];
    expect(payment).toHaveProperty('nsu', '123456789');
    expect(payment).toHaveProperty('authorizationCode', 'AUTH-ABC-123');
  });

  it('getById com valores null não omite nsu e authorizationCode', async () => {
    const paymentWithNullValues = { ...mockPaymentWithNsuAndAuth, nsu: null, authorizationCode: null };
    vi.mocked(paymentRepository.findById).mockResolvedValue(paymentWithNullValues as any);

    const result = await paymentService.getById('user-1', 'payment-nsu-auth-1');

    expect(result).toHaveProperty('nsu');
    expect(result.nsu).toBeNull();
    expect(result).toHaveProperty('authorizationCode');
    expect(result.authorizationCode).toBeNull();
  });
});

describe('PaymentService.create — savedCardId (Cofre)', () => {
  it('chama assertActiveForCharge e usa tokenizationId como cardToken', async () => {
    const debt = makeDebt('d1', 'PENDENTE', 1000);
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([debt] as any);
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce({
      id: 'card-1', userId: 'user-1', tokenizationId: 'tok-cofre', status: 'ACTIVE', holderName: 'X',
    } as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-1', returnCode: '00', returnMessage: 'OK', reference: 'TPW-x',
      cardBin: '544828', brandTid: 'btid-1', transactionLinkId: 'link-1', raw: {},
    } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce({ id: 'p1', userId: 'user-1' } as any);
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({ id: 'p1' } as any);

    await paymentService.create('user-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'card-1',
      card: { number: '', expMonth: '12', expYear: '2030', cvv: '123', holderName: 'X' },
      billing: { name: 'X', email: 'x@x.com', phone: '11', document: '111', birthDate: '2000-01-01', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    });

    expect(savedCardService.assertActiveForCharge).toHaveBeenCalledWith('user-1', 'card-1');
    const buildCall = vi.mocked(eRedeService.buildCreditPayload).mock.calls[0][0];
    expect(buildCall.cardToken).toBe('tok-cofre');
  });

  it('persiste savedCardId, cardBin, brandTid, transactionLinkId no payment', async () => {
    const debt = makeDebt('d1', 'PENDENTE', 1000);
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([debt] as any);
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce({
      id: 'card-1', tokenizationId: 'tok-cofre', status: 'ACTIVE', holderName: 'X',
    } as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-1', returnCode: '00', returnMessage: 'OK', reference: 'TPW-x',
      cardBin: '544828', brandTid: 'btid-1', transactionLinkId: 'link-1', raw: {},
    } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce({ id: 'p1', userId: 'user-1' } as any);
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({ id: 'p1' } as any);

    await paymentService.create('user-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'card-1',
      card: { number: '', expMonth: '12', expYear: '2030', cvv: '123', holderName: 'X' },
      billing: { name: 'X', email: 'x@x.com', phone: '11', document: '111', birthDate: '2000-01-01', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    });

    expect(paymentRepository.update).toHaveBeenCalledWith('p1', expect.objectContaining({
      cardBin: '544828',
      brandTid: 'btid-1',
      transactionLinkId: 'link-1',
    }));
  });

  it('propaga 422 quando assertActiveForCharge falha', async () => {
    const debt = makeDebt('d1', 'PENDENTE', 1000);
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([debt] as any);
    vi.mocked(savedCardService.assertActiveForCharge).mockRejectedValueOnce(
      Object.assign(new Error('Cartão não está ativo'), { statusCode: 422 }),
    );

    await expect(
      paymentService.create('user-1', {
        debtIds: ['d1'],
        method: 'CARTAO_CREDITO',
        installments: 1,
        savedCardId: 'card-1',
        card: { number: '', expMonth: '12', expYear: '2030', cvv: '123', holderName: 'X' },
        billing: { name: 'X', email: 'x@x.com', phone: '11', document: '111', birthDate: '2000-01-01', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
