import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { api, authHeader } from '../helpers/testClient';
import { cleanDatabase, createUser, createDebt } from '../helpers/factories';
import prisma from '../../config/database';

beforeAll(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// 1. Import Debts CSV — POST /api/admin/import/debts
// ---------------------------------------------------------------------------

describe('POST /api/admin/import/debts', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('retorna 200 com success count para CSV válido', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    // Formato: codigo;nome;grupo;distrito;semana;valor;data_vencimento;numero_nf;status
    const csvContent = Buffer.from(
      'C001;Consultora Test;G-TEST;D-TEST;S01/2026;150.00;2026-06-01;NF-CSV-001;PENDENTE\n',
    );

    const res = await api
      .post('/api/admin/import/debts')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .attach('file', csvContent, { filename: 'debts.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.success).toBe(1);
  });

  it('retorna 400 quando nenhum arquivo é enviado', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const res = await api
      .post('/api/admin/import/debts')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(400);
  });

  it('retorna 403 para usuário sem permissão', async () => {
    const consultor = await createUser({ role: 'CONSULTOR', cpf: '52998224725', email: 'consultor@test.com' });
    const token = authHeader(consultor.id, 'CONSULTOR', consultor.email);
    const csvContent = Buffer.from('C001;Test;G;D;S01;100;2026-06-01;NF-001;PENDENTE\n');

    const res = await api
      .post('/api/admin/import/debts')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .attach('file', csvContent, { filename: 'debts.csv', contentType: 'text/csv' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 2. Settings — GET/PUT /api/admin/settings (GERENTE only)
// ---------------------------------------------------------------------------

describe('GET /api/admin/settings', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('retorna 200 com objeto de settings', async () => {
    const gerente = await createUser({ role: 'GERENTE' });
    const token = authHeader(gerente.id, 'GERENTE', gerente.email);

    const res = await api
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
  });

  it('retorna 403 para ADMIN (somente GERENTE pode acessar settings)', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const res = await api
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/settings', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('atualiza e retorna settings atualizadas', async () => {
    const gerente = await createUser({ role: 'GERENTE' });
    const token = authHeader(gerente.id, 'GERENTE', gerente.email);

    const res = await api
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .send({ max_active_payment_links: '5' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Users listing — GET /api/admin/users
// ---------------------------------------------------------------------------

describe('GET /api/admin/users', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('retorna 200 com lista paginada de usuários', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    // Cria alguns usuários extras para listar
    await createUser({ cpf: '52998224725', email: 'user1@test.com', role: 'CONSULTOR' });
    await createUser({ cpf: '29375235016', email: 'user2@test.com', role: 'CONSULTOR' });

    const res = await api
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(3);
  });

  it('filtra usuários por isActive=true', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    await createUser({ cpf: '52998224725', email: 'active@test.com', role: 'CONSULTOR', isActive: true });
    await createUser({ cpf: '29375235016', email: 'inactive@test.com', role: 'CONSULTOR', isActive: false });

    const res = await api
      .get('/api/admin/users?isActive=true')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    const inactiveUsers = res.body.data.filter((u: { isActive: boolean }) => !u.isActive);

    expect(inactiveUsers).toHaveLength(0);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await api.get('/api/admin/users');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 4. User deactivation — PATCH /api/admin/users/:id/deactivate
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/users/:id/deactivate', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('retorna usuário com isActive=false após desativação', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const target = await createUser({ cpf: '52998224725', email: 'target@test.com', role: 'CONSULTOR' });

    const res = await api
      .patch(`/api/admin/users/${target.id}/deactivate`)
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.id).toBe(target.id);
  });

  it('retorna 404 para ID inexistente', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const res = await api
      .patch('/api/admin/users/nonexistent-id-00000000/deactivate')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 5a. Debt management — POST /api/admin/debts
// ---------------------------------------------------------------------------

describe('POST /api/admin/debts', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('cria um débito e retorna 201', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const res = await api
      .post('/api/admin/debts')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .send({
        codigo: 'C001',
        nome: 'Consultora Teste',
        grupo: 'G-TEST',
        distrito: 'D-TEST',
        semana: 'S01/2026',
        valor: '150.00',
        dataVencimento: '2026-06-01',
        numeroNf: `NF-ADMIN-${Date.now()}`,
        status: 'PENDENTE',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.codigo).toBe('C001');
    expect(res.body.data.status).toBe('PENDENTE');
  });

  it('retorna 403 para CONSULTOR', async () => {
    const consultor = await createUser({ role: 'CONSULTOR' });
    const token = authHeader(consultor.id, 'CONSULTOR', consultor.email);

    const res = await api
      .post('/api/admin/debts')
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .send({
        codigo: 'C001',
        nome: 'Test',
        grupo: 'G',
        distrito: 'D',
        semana: 'S01',
        valor: '100',
        dataVencimento: '2026-06-01',
        numeroNf: 'NF-TEST-001',
      });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5b. Debt management — PATCH /api/admin/debts/:id/status
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/debts/:id/status', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('atualiza o status do débito para PAGO', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const debt = await createDebt({ status: 'PENDENTE' });

    const res = await api
      .patch(`/api/admin/debts/${debt.id}/status`)
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .send({ status: 'PAGO' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('PAGO');
    expect(res.body.data.id).toBe(debt.id);
  });

  it('atualiza o status do débito para ATRASADO', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const token = authHeader(admin.id, 'ADMIN', admin.email);

    const debt = await createDebt({ status: 'PENDENTE' });

    const res = await api
      .patch(`/api/admin/debts/${debt.id}/status`)
      .set('Authorization', `Bearer ${token.Authorization.split(' ')[1]}`)
      .send({ status: 'ATRASADO' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('ATRASADO');
  });
});
