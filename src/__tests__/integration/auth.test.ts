import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { api } from '../helpers/testClient';
import { createUser, cleanDatabase } from '../helpers/factories';
import prisma from '../../config/database';

beforeAll(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await cleanDatabase();
    await createUser({ email: 'login@test.com', cpf: '11144477735', password: 'Senha@123' });
  });

  it('retorna 200 com token e user para credenciais válidas', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'login@test.com', password: 'Senha@123' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('login@test.com');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.status).toBe('success');
  });

  it('retorna 401 para senha incorreta', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'login@test.com', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 para e-mail inexistente', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'nao@existe.com', password: 'qualquer' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('retorna 201 com token e user para dados válidos', async () => {
    const res = await api.post('/api/auth/register').send({
      name: 'New User',
      cpf: '11144477735',
      email: 'new@test.com',
      password: 'Senha@123',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('new@test.com');
    expect(res.body.status).toBe('success');
  });

  it('retorna 400 para CPF inválido', async () => {
    const res = await api.post('/api/auth/register').send({
      name: 'X', cpf: '00000000000', email: 'x@x.com', password: 'pass',
    });
    expect(res.status).toBe(400);
  });

  it('retorna 409 quando CPF já existe', async () => {
    await createUser({ cpf: '11144477735', email: 'existing@test.com' });

    const res = await api.post('/api/auth/register').send({
      name: 'Usuario Duplicado', cpf: '11144477735', email: 'new2@test.com', password: 'Senha@123',
    });
    expect(res.status).toBe(409);
  });

  it('retorna 409 quando e-mail já existe', async () => {
    await createUser({ cpf: '52998224725', email: 'existing2@test.com' });

    const res = await api.post('/api/auth/register').send({
      name: 'Usuario Email Dup', cpf: '11144477735', email: 'existing2@test.com', password: 'Senha@123',
    });
    expect(res.status).toBe(409);
  });
});
