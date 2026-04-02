import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/UserRepository', () => ({
  default: {
    findByEmail: vi.fn(),
    findByCpf: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: {
    findByCpf: vi.fn(),
    linkToUser: vi.fn(),
  },
}));

vi.mock('../../../repositories/PasswordResetRepository', () => ({
  default: {
    findByToken: vi.fn(),
    create: vi.fn(),
    invalidateAllForUser: vi.fn(),
    markAsUsed: vi.fn(),
  },
}));

vi.mock('../../../services/EmailService', () => ({
  default: { sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) },
}));

import authService from '../../../services/AuthService';
import userRepository from '../../../repositories/UserRepository';
import consultantRepository from '../../../repositories/ConsultantRepository';
import passwordResetRepository from '../../../repositories/PasswordResetRepository';

const makeMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-uuid-1',
  name: 'Test User',
  cpf: '11144477735',
  email: 'test@email.com',
  password: '$2a$10$hashedpassword',
  role: 'CONSULTOR',
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
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeResetRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'reset-1',
  userId: 'user-uuid-1',
  token: 'valid-token-abc',
  expiresAt: new Date(Date.now() + 3_600_000),
  used: false,
  createdAt: new Date(),
  user: makeMockUser(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-jwt';
  process.env.JWT_EXPIRES_IN = '1d';
  process.env.FRONTEND_URL = 'http://localhost:3000';
});

describe('AuthService.login', () => {
  it('retorna token e user (sem password) com credenciais válidas', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Senha@123', 10);
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser({ password: hash }) as any);

    const result = await authService.login({ email: 'test@email.com', password: 'Senha@123' });

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('test@email.com');
    expect((result.user as any).password).toBeUndefined();
  });

  it('lança 401 quando usuário não existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    await expect(authService.login({ email: 'nao@existe.com', password: 'qualquer' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.UNAUTHORIZED });
  });

  it('lança 401 com senha incorreta', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser() as any);
    await expect(authService.login({ email: 'test@email.com', password: 'senhaerrada' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.UNAUTHORIZED });
  });

  it('mensagem de erro não revela se e-mail existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    const error: any = await authService.login({ email: 'nao@existe.com', password: 'x' }).catch(e => e);
    expect(error.message).toBe('E-mail ou senha incorretos.');
  });
});

describe('AuthService.register', () => {
  it('lança 400 para CPF inválido', async () => {
    await expect(authService.register({ name: 'X', cpf: '00000000000', email: 'x@x.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 409 quando e-mail já está cadastrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser() as any);
    await expect(authService.register({ name: 'X', cpf: '11144477735', email: 'test@email.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('lança 409 quando CPF já está cadastrado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(makeMockUser() as any);
    await expect(authService.register({ name: 'X', cpf: '11144477735', email: 'novo@email.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('vincula consultor e define role=LIDER quando tipo=2', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({
      id: 'c1', tipo: 2, codigo: 'C001', grupo: 'G1', distrito: 'D1',
      cpf: '11144477735', userId: null, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    vi.mocked(consultantRepository.linkToUser).mockResolvedValueOnce({} as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeMockUser({ role: 'LIDER' }) as any);

    const result = await authService.register({ name: 'Test', cpf: '11144477735', email: 'novo@email.com', password: 'Senha@123' });
    expect(consultantRepository.linkToUser).toHaveBeenCalledWith('c1', 'user-uuid-1');
    expect(result.user.role).toBe('LIDER');
  });

  it('define role=EMPRESARIA quando tipo=1', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({
      id: 'c2', tipo: 1, codigo: 'C002', grupo: 'G1', distrito: 'D1',
      cpf: '11144477735', userId: null, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    vi.mocked(consultantRepository.linkToUser).mockResolvedValueOnce({} as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeMockUser({ role: 'EMPRESARIA' }) as any);

    const result = await authService.register({ name: 'Test', cpf: '11144477735', email: 'novo@email.com', password: 'pass' });
    expect(result.user.role).toBe('EMPRESARIA');
  });

  it('não falha quando não há consultor vinculado', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce(null);

    const result = await authService.register({ name: 'Test', cpf: '11144477735', email: 'novo@email.com', password: 'pass' });
    expect(result.token).toBeDefined();
    expect(consultantRepository.linkToUser).not.toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword', () => {
  it('lança 400 para token inexistente', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(null);
    await expect(authService.resetPassword('token-invalido', 'novaSenha'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 para token já utilizado', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(makeResetRecord({ used: true }) as any);
    await expect(authService.resetPassword('token-usado', 'novaSenha'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('lança 400 para token expirado', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(
      makeResetRecord({ expiresAt: new Date(Date.now() - 1000) }) as any,
    );
    await expect(authService.resetPassword('token-expirado', 'novaSenha'))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('atualiza senha e marca token como usado com token válido', async () => {
    vi.mocked(passwordResetRepository.findByToken).mockResolvedValueOnce(makeResetRecord() as any);
    vi.mocked(userRepository.update).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(passwordResetRepository.markAsUsed).mockResolvedValueOnce({} as any);

    const result = await authService.resetPassword('valid-token-abc', 'novaSenha123');
    expect(userRepository.update).toHaveBeenCalledWith('user-uuid-1', expect.objectContaining({ password: expect.any(String) }));
    expect(passwordResetRepository.markAsUsed).toHaveBeenCalledWith('reset-1');
    expect(result.message).toBeDefined();
  });
});

describe('AuthService.forgotPassword', () => {
  it('retorna mensagem genérica quando e-mail não existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
    const result = await authService.forgotPassword('nao@existe.com');
    expect(result.message).toContain('Se o e-mail');
  });

  it('invalida tokens anteriores e cria novo quando e-mail existe', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(makeMockUser() as any);
    vi.mocked(passwordResetRepository.invalidateAllForUser).mockResolvedValueOnce({} as any);
    vi.mocked(passwordResetRepository.create).mockResolvedValueOnce({} as any);

    await authService.forgotPassword('test@email.com');
    expect(passwordResetRepository.invalidateAllForUser).toHaveBeenCalledWith('user-uuid-1');
    expect(passwordResetRepository.create).toHaveBeenCalled();
  });
});

describe('AuthService.login — conta inativa', () => {
  it('lança 403 quando usuário está inativo', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Senha@123', 10);
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(
      makeMockUser({ password: hash, isActive: false }) as any,
    );
    await expect(authService.login({ email: 'test@email.com', password: 'Senha@123' }))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });

  it('mensagem de erro indica conta inativa', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Senha@123', 10);
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(
      makeMockUser({ password: hash, isActive: false }) as any,
    );
    const error: any = await authService.login({ email: 'test@email.com', password: 'Senha@123' }).catch(e => e);
    expect(error.message).toContain('inativa');
  });

  it('login bem-sucedido para usuário ativo', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Senha@123', 10);
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(
      makeMockUser({ password: hash, isActive: true }) as any,
    );
    const result = await authService.login({ email: 'test@email.com', password: 'Senha@123' });
    expect(result.token).toBeDefined();
  });
});
