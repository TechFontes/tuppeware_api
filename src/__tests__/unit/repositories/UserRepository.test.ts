import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import userRepository from '../../../repositories/UserRepository';
import prisma from '../../../config/database';

beforeEach(() => { vi.clearAllMocks(); });

describe('UserRepository.findPermissionsById', () => {
  it('busca user por id retornando apenas id, permissions e role (sem joins)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      permissions: ['users.manage', 'debts.manage'],
      role: 'ADMIN',
    } as any);

    const result = await userRepository.findPermissionsById('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, permissions: true, role: true },
    });
    expect(result?.id).toBe('user-1');
    expect(result?.role).toBe('ADMIN');
    expect(result?.permissions).toEqual(['users.manage', 'debts.manage']);
  });

  it('retorna null quando user não existe', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const result = await userRepository.findPermissionsById('nope');

    expect(result).toBeNull();
  });

  it('NÃO faz join com consultant (lightweight para hot path)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', permissions: [], role: 'CONSULTOR',
    } as any);

    await userRepository.findPermissionsById('u1');

    const callArg = vi.mocked(prisma.user.findUnique).mock.calls[0][0];
    expect(callArg).not.toHaveProperty('include');
    expect(callArg.select).toBeDefined();
  });
});
