import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../repositories/UserRepository', () => ({
  default: {
    findPermissionsById: vi.fn(),
  },
}));

const getModule = async () => {
  vi.resetModules();
  const mod = await import('../../../middlewares/permissionMiddleware');
  const repo = (await import('../../../repositories/UserRepository')).default;
  return { mod, repo };
};

const mockReq = (user?: { id: string; role: string; email: string } | undefined) => ({
  user,
}) as any;

const mockRes = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requirePermission — auth', () => {
  it('lança 401 quando req.user não existe', async () => {
    const { mod } = await getModule();
    const middleware = mod.requirePermission('users.manage');
    const req = mockReq(undefined);
    const next = vi.fn();

    await expect(middleware(req, mockRes(), next)).rejects.toMatchObject({ statusCode: 401 });
    expect(next).not.toHaveBeenCalled();
  });

  it('lança 401 quando user não existe no DB', async () => {
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById).mockResolvedValueOnce(null);
    const middleware = mod.requirePermission('users.manage');
    const req = mockReq({ id: 'ghost', role: 'ADMIN', email: 'g@g.com' });
    const next = vi.fn();

    await expect(middleware(req, mockRes(), next)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('requirePermission — perm check', () => {
  it('chama next() quando user tem a permissão', async () => {
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById).mockResolvedValueOnce({
      id: 'u1', role: 'ADMIN', permissions: ['users.manage', 'debts.manage'],
    } as any);
    const middleware = mod.requirePermission('users.manage');
    const req = mockReq({ id: 'u1', role: 'ADMIN', email: 'a@a.com' });
    const next = vi.fn();

    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(repo.findPermissionsById).toHaveBeenCalledWith('u1');
  });

  it('lança 403 quando user NÃO tem a permissão', async () => {
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById).mockResolvedValueOnce({
      id: 'u1', role: 'ADMIN', permissions: ['debts.manage'],
    } as any);
    const middleware = mod.requirePermission('settings.manage');
    const req = mockReq({ id: 'u1', role: 'ADMIN', email: 'a@a.com' });
    const next = vi.fn();

    await expect(middleware(req, mockRes(), next)).rejects.toMatchObject({ statusCode: 403 });
    expect(next).not.toHaveBeenCalled();
  });

  it('aceita permissions vindo do Prisma como tipo unknown (JsonValue)', async () => {
    const { mod, repo } = await getModule();
    // Prisma retorna como JsonValue (unknown). Middleware faz cast.
    vi.mocked(repo.findPermissionsById).mockResolvedValueOnce({
      id: 'u1', role: 'GERENTE', permissions: ['users.manage'] as unknown,
    } as any);
    const middleware = mod.requirePermission('users.manage');
    const next = vi.fn();

    await middleware(mockReq({ id: 'u1', role: 'GERENTE', email: 'g@g.com' }), mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('requirePermission — cache', () => {
  it('cache hit em chamada subsequente (segunda chamada NÃO bate no DB)', async () => {
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById).mockResolvedValueOnce({
      id: 'u1', role: 'ADMIN', permissions: ['users.manage'],
    } as any);
    const middleware = mod.requirePermission('users.manage');
    const req = mockReq({ id: 'u1', role: 'ADMIN', email: 'a@a.com' });

    await middleware(req, mockRes(), vi.fn());
    await middleware(req, mockRes(), vi.fn());
    await middleware(req, mockRes(), vi.fn());

    expect(repo.findPermissionsById).toHaveBeenCalledTimes(1);
  });

  it('cache TTL: chamada após 60s expira e busca de novo', async () => {
    vi.useFakeTimers();
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById)
      .mockResolvedValueOnce({ id: 'u1', role: 'ADMIN', permissions: ['users.manage'] } as any)
      .mockResolvedValueOnce({ id: 'u1', role: 'ADMIN', permissions: ['users.manage'] } as any);
    const middleware = mod.requirePermission('users.manage');
    const req = mockReq({ id: 'u1', role: 'ADMIN', email: 'a@a.com' });

    await middleware(req, mockRes(), vi.fn());
    // Avança 61s
    vi.advanceTimersByTime(61_000);
    await middleware(req, mockRes(), vi.fn());

    expect(repo.findPermissionsById).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('clearPermissionCache(userId) força nova busca na próxima chamada', async () => {
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById)
      .mockResolvedValueOnce({ id: 'u1', role: 'ADMIN', permissions: ['users.manage'] } as any)
      .mockResolvedValueOnce({ id: 'u1', role: 'ADMIN', permissions: ['users.manage', 'debts.manage'] } as any);
    const middleware = mod.requirePermission('debts.manage');
    const req = mockReq({ id: 'u1', role: 'ADMIN', email: 'a@a.com' });

    // 1ª: só users.manage no cache → 403 em debts.manage
    await expect(middleware(req, mockRes(), vi.fn())).rejects.toMatchObject({ statusCode: 403 });

    // Limpa cache
    mod.clearPermissionCache('u1');

    // 2ª: nova busca, agora tem debts.manage
    const next = vi.fn();
    await middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(repo.findPermissionsById).toHaveBeenCalledTimes(2);
  });

  it('clearPermissionCache não afeta outros users', async () => {
    const { mod, repo } = await getModule();
    vi.mocked(repo.findPermissionsById)
      .mockResolvedValueOnce({ id: 'u1', role: 'ADMIN', permissions: ['users.manage'] } as any)
      .mockResolvedValueOnce({ id: 'u2', role: 'ADMIN', permissions: ['users.manage'] } as any);
    const middleware = mod.requirePermission('users.manage');

    await middleware(mockReq({ id: 'u1', role: 'ADMIN', email: 'a@a.com' }), mockRes(), vi.fn());
    await middleware(mockReq({ id: 'u2', role: 'ADMIN', email: 'b@b.com' }), mockRes(), vi.fn());

    // Limpa só u1
    mod.clearPermissionCache('u1');

    // u2 continua cacheado
    await middleware(mockReq({ id: 'u2', role: 'ADMIN', email: 'b@b.com' }), mockRes(), vi.fn());

    expect(repo.findPermissionsById).toHaveBeenCalledTimes(2); // u1, u2 — não 3
  });
});
