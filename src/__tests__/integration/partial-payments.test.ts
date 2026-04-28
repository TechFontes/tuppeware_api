import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { api, authHeader } from '../helpers/testClient';
import { createUser, createDebt, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

// Mock do gateway eRede — não chama API real
import { vi } from 'vitest';

vi.mock('../../services/ERedeService', () => ({
  default: {
    buildPixPayload: vi.fn().mockReturnValue({ kind: 'pix', reference: 'TPW-mock', amount: 4000, expirationDate: '' }),
    buildCreditPayload: vi.fn().mockReturnValue({ kind: 'credit' }),
    createTransaction: vi.fn().mockImplementation(() =>
      Promise.resolve({
        tid: `tid-partial-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        returnCode: '00',
        returnMessage: 'Aprovado',
        reference: 'TPW-mock',
        pix: { qrCode: '00020126...', link: 'https://pix.link/qr', expirationDate: '2026-06-01T10:00:00Z' },
        raw: {},
      }),
    ),
    validateCallbackSignature: vi.fn().mockReturnValue(true),
    mapStatusToLocal: vi.fn().mockReturnValue('PAGO'),
  },
}));

vi.mock('../../services/WebSocketService', () => ({
  default: { emitToUser: vi.fn() },
}));

describe('Partial Payments — integration', () => {
  let webhookServer: http.Server;
  let webhookEvents: Array<{ headers: any; body: any }>;
  let webhookPort: number;
  let user: any;

  beforeAll(async () => {
    webhookEvents = [];
    webhookServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          webhookEvents.push({ headers: req.headers, body: JSON.parse(raw) });
        } catch {
          webhookEvents.push({ headers: req.headers, body: raw });
        }
        res.writeHead(200).end();
      });
    });

    await new Promise<void>((r) => webhookServer.listen(0, () => r()));
    webhookPort = (webhookServer.address() as any).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => webhookServer.close(() => r()));
    await cleanDatabase();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await prisma.setting.deleteMany();
    webhookEvents.length = 0;

    // Usar ADMIN para evitar exigência de Consultant na hierarquia
    user = await createUser({ email: 'partial-admin@test.com', cpf: '98765432100', role: 'ADMIN' });

    // Settings inseridas via Prisma direto (bypass da validação do SettingsService que exige https)
    await prisma.setting.createMany({
      data: [
        { key: 'partial_payment_enabled', value: 'true' },
        { key: 'partial_payment_min_amount', value: '10' },
        { key: 'partial_payment_min_remaining', value: '5' },
        { key: 'payment_webhook_url', value: `http://localhost:${webhookPort}/hook` },
        { key: 'payment_webhook_secret', value: 'test-secret-16chars!' },
      ],
    });
  });

  it('fluxo completo: cria parcial → callback confirma → paidAmount sobe → webhook recebido', async () => {
    const debt = await createDebt({ valor: 100, numeroNf: `NF-PARTIAL-001-${Date.now()}` });

    // POST /api/payments/partial
    const createRes = await api
      .post('/api/payments/partial')
      .set(authHeader(user.id, 'ADMIN', user.email))
      .send({ debtId: debt.id, amount: 40 });

    expect(createRes.status).toBe(201);
    const { referenceNum } = createRes.body;
    expect(referenceNum).toBeDefined();

    // Recupera o tid persistido (o mock do gateway gera novo TID a cada call,
    // então precisamos usar o mesmo valor que foi salvo no banco).
    const persisted = await prisma.payment.findUnique({ where: { id: createRes.body.paymentId } });
    expect(persisted?.gatewayTransactionId).toBeTruthy();

    // Simular callback da eRede confirmando o pagamento
    const callbackRes = await api
      .post('/api/payments/callback/erede')
      .set({ 'x-erede-secret': process.env.EREDE_CALLBACK_SECRET || 'test-callback-secret' })
      .send({
        tid: persisted!.gatewayTransactionId,
        returnCode: '00',
        status: 0,
        reference: referenceNum,
        amount: 4000,
      });

    expect(callbackRes.status).toBe(200);

    // Aguardar dispatcher async (setImmediate + fetch)
    await new Promise((r) => setTimeout(r, 300));

    // Verificar que paidAmount aumentou no banco
    const updatedDebt = await prisma.debt.findUnique({ where: { id: debt.id } });
    expect(parseFloat(updatedDebt!.paidAmount.toString())).toBe(40);

    // Verificar webhook recebido
    expect(webhookEvents.length).toBe(1);
    expect(webhookEvents[0].body.paymentType).toBe('PARTIAL');
    expect(webhookEvents[0].body.debt.remaining).toBe(60);
    expect(webhookEvents[0].headers['x-tuppeware-signature']).toMatch(/^sha256=/);
  });

  it('dois parciais sequenciais quitam a dívida (status PAGO)', async () => {
    const debt = await createDebt({ valor: 100, numeroNf: `NF-PARTIAL-002-${Date.now()}` });

    // Primeiro parcial: R$ 40
    const create1 = await api
      .post('/api/payments/partial')
      .set(authHeader(user.id, 'ADMIN', user.email))
      .send({ debtId: debt.id, amount: 40 });

    expect(create1.status).toBe(201);
    const ref1 = create1.body.referenceNum;
    const persisted1 = await prisma.payment.findUnique({ where: { id: create1.body.paymentId } });

    await api
      .post('/api/payments/callback/erede')
      .set({ 'x-erede-secret': 'test-callback-secret' })
      .send({ tid: persisted1!.gatewayTransactionId, returnCode: '00', status: 0, reference: ref1, amount: 4000 });

    await new Promise((r) => setTimeout(r, 150));

    // Segundo parcial: R$ 60 (quita a dívida)
    const create2 = await api
      .post('/api/payments/partial')
      .set(authHeader(user.id, 'ADMIN', user.email))
      .send({ debtId: debt.id, amount: 60 });

    expect(create2.status).toBe(201);
    const ref2 = create2.body.referenceNum;
    const persisted2 = await prisma.payment.findUnique({ where: { id: create2.body.paymentId } });

    await api
      .post('/api/payments/callback/erede')
      .set({ 'x-erede-secret': 'test-callback-secret' })
      .send({ tid: persisted2!.gatewayTransactionId, returnCode: '00', status: 0, reference: ref2, amount: 6000 });

    await new Promise((r) => setTimeout(r, 150));

    // Verificar status final
    const finalDebt = await prisma.debt.findUnique({ where: { id: debt.id } });
    expect(finalDebt!.status).toBe('PAGO');
    expect(parseFloat(finalDebt!.paidAmount.toString())).toBe(100);
  });

  it('feature desabilitada retorna 403', async () => {
    await prisma.setting.update({
      where: { key: 'partial_payment_enabled' },
      data: { value: 'false' },
    });

    const debt = await createDebt({ valor: 100, numeroNf: `NF-PARTIAL-003-${Date.now()}` });

    const res = await api
      .post('/api/payments/partial')
      .set(authHeader(user.id, 'ADMIN', user.email))
      .send({ debtId: debt.id, amount: 40 });

    expect(res.status).toBe(403);
  });

  it('parcial que deixaria menos que min_remaining retorna 400', async () => {
    // Debt valor=100, amount=98 → sobrariam 2, min=5 → deve rejeitar
    const debt = await createDebt({ valor: 100, numeroNf: `NF-PARTIAL-004-${Date.now()}` });

    const res = await api
      .post('/api/payments/partial')
      .set(authHeader(user.id, 'ADMIN', user.email))
      .send({ debtId: debt.id, amount: 98 });

    expect(res.status).toBe(400);
  });
});
