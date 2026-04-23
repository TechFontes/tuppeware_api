import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { api, authHeader } from '../helpers/testClient';
import { createUser, createDebt, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

// Mock do gateway eRede — não chama API real
vi.mock('../../services/ERedeService', () => ({
  default: {
    buildPixPayload: vi.fn().mockReturnValue({ kind: 'pix', reference: 'TPW-mock', amount: 15000, expirationDate: '' }),
    buildCreditPayload: vi.fn().mockReturnValue({ kind: 'credit' }),
    createTransaction: vi.fn().mockImplementation(() => Promise.resolve({
      tid: `tid-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      returnCode: '00',
      returnMessage: 'Aprovado',
      reference: 'TPW-mock',
      pix: { qrCode: '00020126...', link: 'https://pix.link/qr', expirationDate: '2026-04-02T10:00:00Z' },
      raw: {},
    })),
    validateCallbackSignature: vi.fn().mockReturnValue(true),
    mapStatusToLocal: vi.fn().mockReturnValue('PAGO'),
  },
}));

vi.mock('../../services/WebSocketService', () => ({
  default: { emitToUser: vi.fn() },
}));

let user: any;
let debt1: any;
let debt2: any;
let paidDebt: any;
let smallDebt: any;

const billingBase = {
  name: 'Test User', email: 'test@email.com', phone: '11999999999',
  document: '11144477735', birthDate: '1990-01-01', address: 'Rua Exemplo',
  district: 'Centro', city: 'São Paulo', state: 'SP', postalcode: '01310100',
};

beforeAll(async () => {
  await cleanDatabase();
  user = await createUser({ email: 'payment-user@test.com', cpf: '98765432100', role: 'CONSULTOR' });
  debt1 = await createDebt({ valor: 150, numeroNf: 'NF-PAY-001' });
  debt2 = await createDebt({ valor: 200, numeroNf: 'NF-PAY-002' });
  paidDebt = await createDebt({ valor: 100, status: 'PAGO', numeroNf: 'NF-PAY-PAID' });
  smallDebt = await createDebt({ valor: 100, numeroNf: 'NF-PAY-SMALL' });
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /api/payments', () => {
  it('cria pagamento PIX e retorna qrCode + checkoutUrl', async () => {
    const res = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [debt1.id], method: 'PIX', billing: billingBase });

    expect(res.status).toBe(201);
    expect(res.body.data.qrCode).toBeDefined();
    expect(res.body.data.checkoutUrl).toBeDefined();
  });

  it('retorna 400 para débito já pago', async () => {
    const res = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [paidDebt.id], method: 'PIX', billing: billingBase });

    expect(res.status).toBe(400);
  });

  it('retorna 400 para installments inválido (valor < 300, parcelas > 1)', async () => {
    const res = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({
        debtIds: [smallDebt.id],
        method: 'CARTAO_CREDITO',
        installments: 2,
        card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TEST' },
        billing: billingBase,
      });

    expect(res.status).toBe(400);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await api.post('/api/payments').send({ debtIds: [debt1.id], method: 'PIX', billing: billingBase });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/payments/:id (via paymentHistoryRoutes)', () => {
  it('pagamento criado aparece no histórico do usuário', async () => {
    // Cria um pagamento
    const createRes = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [debt2.id], method: 'PIX', billing: billingBase });

    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.data.id;

    // Verifica no histórico
    const histRes = await api
      .get('/api/payment-history')
      .set(authHeader(user.id, 'CONSULTOR', user.email));

    expect(histRes.status).toBe(200);
    const found = histRes.body.data?.find((p: any) => p.id === paymentId);
    expect(found).toBeDefined();
  });

  it('GET /api/payment-history/:id expõe nsu e authorizationCode quando presentes', async () => {
    // Cria um pagamento
    const createRes = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [debt1.id], method: 'PIX', billing: billingBase });

    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.data.id;

    // Atualiza o pagamento com nsu e authorizationCode via callback simulado
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        nsu: 'NSU-TEST-123',
        authorizationCode: 'AUTH-CODE-456',
      },
    });

    // Busca o pagamento específico
    const detailRes = await api
      .get(`/api/payment-history/${paymentId}`)
      .set(authHeader(user.id, 'CONSULTOR', user.email));

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data).toHaveProperty('nsu', 'NSU-TEST-123');
    expect(detailRes.body.data).toHaveProperty('authorizationCode', 'AUTH-CODE-456');
  });

  it('GET /api/payment-history lista com nsu e authorizationCode exposto', async () => {
    // Cria um pagamento
    const createRes = await api
      .post('/api/payments')
      .set(authHeader(user.id, 'CONSULTOR', user.email))
      .send({ debtIds: [smallDebt.id], method: 'PIX', billing: billingBase });

    expect(createRes.status).toBe(201);
    const paymentId = createRes.body.data.id;

    // Atualiza com nsu
    await prisma.payment.update({
      where: { id: paymentId },
      data: { nsu: 'NSU-LIST-789', authorizationCode: 'AUTH-LIST-000' },
    });

    // Lista o histórico
    const listRes = await api
      .get('/api/payment-history')
      .set(authHeader(user.id, 'CONSULTOR', user.email));

    expect(listRes.status).toBe(200);
    const payment = listRes.body.data?.find((p: any) => p.id === paymentId);
    expect(payment).toBeDefined();
    expect(payment).toHaveProperty('nsu', 'NSU-LIST-789');
    expect(payment).toHaveProperty('authorizationCode', 'AUTH-LIST-000');
  });
});
