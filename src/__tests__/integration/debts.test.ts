import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, authHeader } from '../helpers/testClient';
import { createUser, createConsultant, createDebt, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

let adminUser: any;
let consultorUser: any;
let liderUser: any;

beforeAll(async () => {
  await cleanDatabase();

  adminUser = await createUser({ email: 'debts-admin@test.com', cpf: '11144477735', role: 'ADMIN' });

  consultorUser = await createUser({ email: 'debts-consultor@test.com', cpf: '52998224725', role: 'CONSULTOR' });
  await createConsultant(consultorUser.id, { codigo: 'C001', tipo: 3, grupo: 'G1', distrito: 'D1', cpf: '52998224725' });

  liderUser = await createUser({ email: 'debts-lider@test.com', cpf: '71428793860', role: 'LIDER' });
  await createConsultant(liderUser.id, { codigo: 'L001', tipo: 2, grupo: 'G1', distrito: 'D1', cpf: '71428793860' });

  // Débitos G1/D1 (pertence ao consultor C001 e ao líder G1)
  await createDebt({ codigo: 'C001', grupo: 'G1', distrito: 'D1', numeroNf: 'NF-INT-001' });
  await createDebt({ codigo: 'C001', grupo: 'G1', distrito: 'D1', numeroNf: 'NF-INT-002' });
  // Débito de outro grupo/distrito
  await createDebt({ codigo: 'C002', grupo: 'G2', distrito: 'D2', numeroNf: 'NF-INT-003' });
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('GET /api/debts', () => {
  it('ADMIN: retorna todos os débitos', async () => {
    const res = await api.get('/api/debts').set(authHeader(adminUser.id, 'ADMIN', adminUser.email));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
  });

  it('CONSULTOR: retorna apenas débitos do seu código (C001)', async () => {
    const res = await api.get('/api/debts').set(authHeader(consultorUser.id, 'CONSULTOR', consultorUser.email));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    res.body.data.forEach((d: any) => expect(d.codigo).toBe('C001'));
  });

  it('LIDER: retorna débitos do seu grupo (G1)', async () => {
    const res = await api.get('/api/debts').set(authHeader(liderUser.id, 'LIDER', liderUser.email));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    res.body.data.forEach((d: any) => expect(d.grupo).toBe('G1'));
  });

  it('retorna 401 sem token', async () => {
    const res = await api.get('/api/debts');
    expect(res.status).toBe(401);
  });

  it('filtra por status=PENDENTE', async () => {
    const res = await api.get('/api/debts?status=PENDENTE').set(authHeader(adminUser.id, 'ADMIN', adminUser.email));
    expect(res.status).toBe(200);
    res.body.data.forEach((d: any) => expect(d.status).toBe('PENDENTE'));
  });

  it('paginação: retorna estrutura e limita resultados', async () => {
    const res = await api.get('/api/debts?page=1&limit=2').set(authHeader(adminUser.id, 'ADMIN', adminUser.email));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.data).toHaveLength(2);
  });
});
