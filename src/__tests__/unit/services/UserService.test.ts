import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/UserRepository', () => ({
  default: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByCpf: vi.fn(),
    findAll: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findPermissionsById: vi.fn(),
  },
}));

vi.mock('../../../repositories/PaymentRepository', () => ({
  default: {
    findByUserId: vi.fn(),
  },
}));

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: {
    upsertByCpf: vi.fn(),
    findByGrupo: vi.fn(),
    findByDistrito: vi.fn(),
  },
}));

vi.mock('../../../middlewares/permissionMiddleware', () => ({
  clearPermissionCache: vi.fn(),
  requirePermission: vi.fn(),
}));

import userService from '../../../services/UserService';
import userRepository from '../../../repositories/UserRepository';
import paymentRepository from '../../../repositories/PaymentRepository';
import consultantRepository from '../../../repositories/ConsultantRepository';
import { clearPermissionCache } from '../../../middlewares/permissionMiddleware';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  name: 'Test User',
  cpf: '11144477735',
  email: 'test@email.com',
  password: '$2a$10$hashedpassword',
  role: 'CONSULTOR' as const,
  isActive: true,
  phone: null,
  birthDate: null,
  address: null,
  addressNumber: null,
  addressComplement: null,
  neighbourhood: null,
  city: null,
  state: null,
  postalCode: null,
  consultant: null,
  jobTitle: null,
  permissions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makePagination = () => ({ page: 1, limit: 10, skip: 0 });

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------ findById
describe('UserService.findById', () => {
  it('retorna usuário sem password quando encontrado', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    const result = await userService.findById('user-1');
    expect(result.id).toBe('user-1');
    expect((result as any).password).toBeUndefined();
  });

  it('lança 404 quando usuário não existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);
    await expect(userService.findById('nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });
});

// ----------------------------------------------------------------- findByEmail
describe('UserService.findByEmail', () => {
  it('retorna usuário sem password quando encontrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeUser() as any);
    const result = await userService.findByEmail('test@email.com');
    expect((result as any).password).toBeUndefined();
  });

  it('lança 404 quando e-mail não existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    await expect(userService.findByEmail('nao@existe.com'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });
});

// -------------------------------------------------------------------- update
describe('UserService.update', () => {
  it('atualiza e retorna usuário sem password', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ name: 'Novo Nome' }) as any);
    const result = await userService.update('user-1', { name: 'Novo Nome' });
    expect(result.name).toBe('Novo Nome');
    expect((result as any).password).toBeUndefined();
  });

  it('lança 404 quando usuário não existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);
    await expect(userService.update('nao-existe', { name: 'X' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('normaliza birthDate "YYYY-MM-DD" para Date antes de persistir', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser() as any);

    await userService.update('user-1', { birthDate: '2026-04-28' } as any);

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.birthDate).toBeInstanceOf(Date);
    expect((updateCall.birthDate as Date).toISOString()).toBe('2026-04-28T00:00:00.000Z');
  });

  it('aceita birthDate em ISO completo sem alterar o valor', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser() as any);

    const iso = '2026-04-28T12:34:56.000Z';
    await userService.update('user-1', { birthDate: iso } as any);

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.birthDate).toBeInstanceOf(Date);
    expect((updateCall.birthDate as Date).toISOString()).toBe(iso);
  });

  it('lança 400 quando birthDate é inválido', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);

    await expect(userService.update('user-1', { birthDate: 'data-invalida' } as any))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('mantém birthDate=null quando explicitamente nulo', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser() as any);

    await userService.update('user-1', { birthDate: null } as any);

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.birthDate).toBeNull();
  });
});

// -------------------------------------------------------------------- findAll
describe('UserService.findAll', () => {
  it('retorna lista de usuários sem password', async () => {
    vi.mocked(userRepository.findAll).mockResolvedValueOnce([makeUser(), makeUser({ id: 'user-2' })] as any);
    const result = await userService.findAll();
    expect(result).toHaveLength(2);
    result.forEach((u) => expect((u as any).password).toBeUndefined());
  });
});

// ------------------------------------------------------------------ listUsers
describe('UserService.listUsers', () => {
  it('retorna paginação com shape correto', async () => {
    vi.mocked(userRepository.findMany).mockResolvedValueOnce({ data: [makeUser()], total: 1 } as any);
    const result = await userService.listUsers({ pagination: makePagination() });
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.data).toHaveLength(1);
    expect((result.data[0] as any).password).toBeUndefined();
  });

  it('filtra por role quando fornecido', async () => {
    vi.mocked(userRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 } as any);
    await userService.listUsers({ role: 'ADMIN', pagination: makePagination() });
    expect(vi.mocked(userRepository.findMany).mock.calls[0][0].where).toMatchObject({ role: 'ADMIN' });
  });

  it('filtra por isActive quando fornecido', async () => {
    vi.mocked(userRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 } as any);
    await userService.listUsers({ isActive: false, pagination: makePagination() });
    expect(vi.mocked(userRepository.findMany).mock.calls[0][0].where).toMatchObject({ isActive: false });
  });

  it('filtra por grupo e distrito via consultant', async () => {
    vi.mocked(userRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 } as any);
    await userService.listUsers({ grupo: 'G1', distrito: 'D1', pagination: makePagination() });
    const where = vi.mocked(userRepository.findMany).mock.calls[0][0].where as any;
    expect(where.consultant.is.grupo).toBe('G1');
    expect(where.consultant.is.distrito).toBe('D1');
  });
});

// --------------------------------------------------------------- deactivateUser
describe('UserService.deactivateUser', () => {
  it('chama softDelete e retorna usuário sem password', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    vi.mocked(userRepository.softDelete).mockResolvedValueOnce(makeUser({ isActive: false }) as any);
    const result = await userService.deactivateUser('user-1');
    expect(result.isActive).toBe(false);
    expect((result as any).password).toBeUndefined();
    expect(userRepository.softDelete).toHaveBeenCalledWith('user-1');
  });

  it('lança 404 quando usuário não existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);
    await expect(userService.deactivateUser('nao-existe'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });
});

// ------------------------------------------------------------- getUserPayments
describe('UserService.getUserPayments', () => {
  it('lança 404 quando usuário não existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);
    await expect(userService.getUserPayments('nao-existe', makePagination()))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('retorna pagamentos do usuário quando encontrado', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser() as any);
    vi.mocked(paymentRepository.findByUserId).mockResolvedValueOnce({ data: [], total: 0 } as any);
    const result = await userService.getUserPayments('user-1', makePagination());
    expect(paymentRepository.findByUserId).toHaveBeenCalledWith('user-1', expect.objectContaining({ skip: 0, take: 10 }));
    expect(result).toBeDefined();
  });
});

// --------------------------------------------------------------- createAdmin
describe('UserService.createAdmin', () => {
  const gerenteCaller = { id: 'gerente-1', role: 'GERENTE' };

  it('lança 409 quando e-mail já está cadastrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeUser() as any);
    await expect(userService.createAdmin({ name: 'Admin', cpf: '11144477735', email: 'test@email.com', password: 'Senha@123' }, gerenteCaller))
      .rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('cria usuário com role=ADMIN e retorna sem password', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    const result = await userService.createAdmin({ name: 'Admin', cpf: '11144477735', email: 'novo@email.com', password: 'Senha@123' }, gerenteCaller);
    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(createCall.role).toBe('ADMIN');
    expect((result as any).password).toBeUndefined();
  });

  it('senha é hashada com bcrypt antes de criar', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    await userService.createAdmin({ name: 'Admin', cpf: '11144477735', email: 'novo@email.com', password: 'Senha@123' }, gerenteCaller);
    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(createCall.password).not.toBe('Senha@123');
    expect(createCall.password).toMatch(/^\$2[ab]\$/);
  });
});

// ------- createAdmin com permissions e anti-escalada
describe('UserService.createAdmin (com permissions e anti-escalada)', () => {
  const gerenteCaller = { id: 'gerente-1', role: 'GERENTE' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aceita permissions array vazio quando não fornecido (default)', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN', permissions: [] }) as any);

    await userService.createAdmin(
      { name: 'Admin', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123' },
      gerenteCaller,
    );

    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(createCall.permissions).toEqual([]);
  });

  it('persiste permissions quando fornecidas (GERENTE caller)', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.createAdmin(
      { name: 'Admin', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['users.manage', 'debts.manage'] as any },
      gerenteCaller,
    );

    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(createCall.permissions).toEqual(['users.manage', 'debts.manage']);
  });

  it('persiste jobTitle quando fornecido', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.createAdmin(
      { name: 'Admin', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', jobTitle: 'Coordenadora' },
      gerenteCaller,
    );

    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(createCall.jobTitle).toBe('Coordenadora');
  });

  it('lança 400 quando permissão inválida fornecida', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);

    await expect(userService.createAdmin(
      { name: 'X', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['foo.bar'] as any },
      gerenteCaller,
    )).rejects.toMatchObject({
      statusCode: StatusCodes.BAD_REQUEST,
      message: expect.stringContaining('foo.bar'),
    });
  });

  it('deduplica permissões repetidas no array', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.createAdmin(
      { name: 'A', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['users.manage', 'users.manage', 'debts.manage'] as any },
      gerenteCaller,
    );

    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    expect(createCall.permissions).toEqual(['users.manage', 'debts.manage']);
  });

  it('caller ADMIN com perms parciais NÃO consegue criar ADM com perms que ele não tem', async () => {
    const adminCaller = { id: 'admin-caller', role: 'ADMIN' };
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findPermissionsById).mockResolvedValueOnce({
      id: 'admin-caller', role: 'ADMIN', permissions: ['users.manage'],
    } as any);

    await expect(userService.createAdmin(
      { name: 'X', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['users.manage', 'settings.manage'] as any },
      adminCaller,
    )).rejects.toMatchObject({
      statusCode: StatusCodes.FORBIDDEN,
      message: expect.stringContaining('settings.manage'),
    });
  });

  it('caller ADMIN consegue criar ADM com subset das suas próprias perms', async () => {
    const adminCaller = { id: 'admin-caller', role: 'ADMIN' };
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findPermissionsById).mockResolvedValueOnce({
      id: 'admin-caller', role: 'ADMIN', permissions: ['users.manage', 'debts.manage', 'settings.manage'],
    } as any);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.createAdmin(
      { name: 'X', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['users.manage'] as any },
      adminCaller,
    );

    expect(userRepository.create).toHaveBeenCalled();
  });

  it('caller ADMIN com admins.manage NÃO consegue conceder admins.manage a outro', async () => {
    const adminCaller = { id: 'admin-caller', role: 'ADMIN' };
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findPermissionsById).mockResolvedValueOnce({
      id: 'admin-caller', role: 'ADMIN', permissions: ['admins.manage'],
    } as any);

    await expect(userService.createAdmin(
      { name: 'X', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['admins.manage'] as any },
      adminCaller,
    )).rejects.toMatchObject({
      statusCode: StatusCodes.FORBIDDEN,
      message: expect.stringContaining('admins.manage'),
    });
  });

  it('GERENTE concede admins.manage normalmente', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.createAdmin(
      { name: 'X', cpf: '11144477735', email: 'a@a.com', password: 'Senha@123', permissions: ['admins.manage'] as any },
      gerenteCaller,
    );

    expect(userRepository.create).toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- listAdmins
describe('UserService.listAdmins', () => {
  it('filtra por role=ADMIN e retorna paginação', async () => {
    vi.mocked(userRepository.findMany).mockResolvedValueOnce({ data: [], total: 0 } as any);
    const result = await userService.listAdmins(makePagination());
    expect(vi.mocked(userRepository.findMany).mock.calls[0][0].where).toMatchObject({ role: 'ADMIN' });
    expect(result.pagination).toBeDefined();
  });
});

// --------------------------------------------------------------- updateAdmin
describe('UserService.updateAdmin', () => {
  it('lança 404 quando usuário não existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);
    await expect(userService.updateAdmin('nao-existe', { name: 'X' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('lança 400 quando usuário não é ADMIN', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'CONSULTOR' }) as any);
    await expect(userService.updateAdmin('user-1', { name: 'X' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('atualiza e retorna sem password quando é ADMIN', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN', name: 'Novo' }) as any);
    const result = await userService.updateAdmin('user-1', { name: 'Novo' });
    expect((result as any).password).toBeUndefined();
  });

  it('aceita jobTitle e passa para o repository', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN', jobTitle: 'Coordenadora' }) as any);

    const result = await userService.updateAdmin('user-1', { jobTitle: 'Coordenadora' });

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.jobTitle).toBe('Coordenadora');
    expect(result).toBeDefined();
  });

  it('aceita jobTitle="" para limpar o cargo', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN', jobTitle: '' }) as any);

    await userService.updateAdmin('user-1', { jobTitle: '' });

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.jobTitle).toBe('');
  });
});

// ------------------------------------------------- updateClientConsultant
describe('UserService.updateClientConsultant', () => {
  it('chama upsertByCpf com dados atualizados quando consultor vinculado', async () => {
    const userWithConsultant = makeUser({
      consultant: { id: 'c1', codigo: 'C001', tipo: 3, grupo: 'GrupoVelho', distrito: 'DistritoVelho', cpf: '11144477735', userId: 'user-1', createdAt: new Date(), updatedAt: new Date() },
    });
    // findById called twice: once in updateClientConsultant (via this.findById), once at the end
    vi.mocked(userRepository.findById)
      .mockResolvedValueOnce(userWithConsultant as any)
      .mockResolvedValueOnce(userWithConsultant as any);
    vi.mocked(consultantRepository.upsertByCpf).mockResolvedValueOnce({} as any);

    await userService.updateClientConsultant('user-1', { grupo: 'GrupoNovo' });

    expect(consultantRepository.upsertByCpf).toHaveBeenCalledWith(
      expect.objectContaining({ grupo: 'GrupoNovo', distrito: 'DistritoVelho' }),
    );
  });

  it('não chama upsertByCpf quando usuário não tem consultor', async () => {
    const userWithoutConsultant = makeUser({ consultant: null });
    vi.mocked(userRepository.findById)
      .mockResolvedValueOnce(userWithoutConsultant as any)
      .mockResolvedValueOnce(userWithoutConsultant as any);

    await userService.updateClientConsultant('user-1', { grupo: 'G1' });

    expect(consultantRepository.upsertByCpf).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------- getOrganization
describe('UserService.getOrganization', () => {
  it('filtra por grupo quando apenas grupo fornecido', async () => {
    vi.mocked(consultantRepository.findByGrupo).mockResolvedValueOnce([]);
    await userService.getOrganization({ grupo: 'G1' });
    expect(consultantRepository.findByGrupo).toHaveBeenCalledWith('G1');
  });

  it('filtra por distrito quando apenas distrito fornecido', async () => {
    vi.mocked(consultantRepository.findByDistrito).mockResolvedValueOnce([]);
    await userService.getOrganization({ distrito: 'D1' });
    expect(consultantRepository.findByDistrito).toHaveBeenCalledWith('D1');
  });

  it('filtra por grupo e depois por distrito quando ambos fornecidos', async () => {
    vi.mocked(consultantRepository.findByGrupo).mockResolvedValueOnce([
      { id: 'c1', distrito: 'D1' } as any,
      { id: 'c2', distrito: 'D2' } as any,
    ]);
    const result = await userService.getOrganization({ grupo: 'G1', distrito: 'D1' });
    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe('c1');
  });

  it('chama findByGrupo com string vazia quando nenhum filtro fornecido', async () => {
    vi.mocked(consultantRepository.findByGrupo).mockResolvedValueOnce([]);
    await userService.getOrganization({});
    expect(consultantRepository.findByGrupo).toHaveBeenCalledWith('');
  });
});

// ------------------------------------------------- updateAdminPermissions
describe('UserService.updateAdminPermissions', () => {
  const gerenteCaller = { id: 'gerente-1', role: 'GERENTE' };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('atualiza permissões e invalida cache do target', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN', permissions: ['users.manage'] }) as any);

    const result = await userService.updateAdminPermissions(
      'target-1',
      ['users.manage'] as any,
      gerenteCaller,
    );

    expect(userRepository.update).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({ permissions: ['users.manage'] }),
    );
    expect(clearPermissionCache).toHaveBeenCalledWith('target-1');
    expect(result).toBeDefined();
  });

  it('lança 404 quando target não existe', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(userService.updateAdminPermissions('nope', [] as any, gerenteCaller))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
    expect(clearPermissionCache).not.toHaveBeenCalled();
  });

  it('lança 400 quando target não é ADMIN', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'CONSULTOR' }) as any);

    await expect(userService.updateAdminPermissions('user-1', ['users.manage'] as any, gerenteCaller))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 quando permissão inválida', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await expect(userService.updateAdminPermissions('target-1', ['foo.bar'] as any, gerenteCaller))
      .rejects.toMatchObject({
        statusCode: StatusCodes.BAD_REQUEST,
        message: expect.stringContaining('foo.bar'),
      });
  });

  it('deduplica permissões repetidas', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.updateAdminPermissions(
      'target-1',
      ['users.manage', 'users.manage', 'debts.manage'] as any,
      gerenteCaller,
    );

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.permissions).toEqual(['users.manage', 'debts.manage']);
  });

  it('caller ADMIN não pode dar permissões que ele não tem (anti-escalada)', async () => {
    const adminCaller = { id: 'admin-caller', role: 'ADMIN' };
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.findPermissionsById).mockResolvedValueOnce({
      id: 'admin-caller', role: 'ADMIN', permissions: ['users.manage'],
    } as any);

    await expect(userService.updateAdminPermissions(
      'target-1',
      ['users.manage', 'settings.manage'] as any,
      adminCaller,
    )).rejects.toMatchObject({
      statusCode: StatusCodes.FORBIDDEN,
      message: expect.stringContaining('settings.manage'),
    });
  });

  it('caller ADMIN consegue editar para subset das próprias perms', async () => {
    const adminCaller = { id: 'admin-caller', role: 'ADMIN' };
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.findPermissionsById).mockResolvedValueOnce({
      id: 'admin-caller', role: 'ADMIN', permissions: ['users.manage', 'debts.manage', 'settings.manage'],
    } as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.updateAdminPermissions(
      'target-1',
      ['users.manage', 'debts.manage'] as any,
      adminCaller,
    );

    expect(userRepository.update).toHaveBeenCalled();
    expect(clearPermissionCache).toHaveBeenCalledWith('target-1');
  });

  it('caller ADMIN não pode conceder admins.manage', async () => {
    const adminCaller = { id: 'admin-caller', role: 'ADMIN' };
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.findPermissionsById).mockResolvedValueOnce({
      id: 'admin-caller', role: 'ADMIN', permissions: ['admins.manage'],
    } as any);

    await expect(userService.updateAdminPermissions(
      'target-1',
      ['admins.manage'] as any,
      adminCaller,
    )).rejects.toMatchObject({
      statusCode: StatusCodes.FORBIDDEN,
      message: expect.stringContaining('admins.manage'),
    });
  });

  it('GERENTE concede admins.manage normalmente', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);

    await userService.updateAdminPermissions(
      'target-1',
      ['admins.manage'] as any,
      gerenteCaller,
    );

    expect(userRepository.update).toHaveBeenCalled();
  });

  it('aceita array vazio (revoga todas as permissões)', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(makeUser({ role: 'ADMIN' }) as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeUser({ role: 'ADMIN', permissions: [] }) as any);

    await userService.updateAdminPermissions('target-1', [] as any, gerenteCaller);

    const updateCall = vi.mocked(userRepository.update).mock.calls[0][1] as any;
    expect(updateCall.permissions).toEqual([]);
  });
});
