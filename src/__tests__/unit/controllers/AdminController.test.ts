import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../services/UserService', () => ({
  default: {
    update: vi.fn(),
    findById: vi.fn(),
    listUsers: vi.fn(),
    createAdmin: vi.fn(),
    listAdmins: vi.fn(),
    updateAdmin: vi.fn(),
    deactivateUser: vi.fn(),
    getUserPayments: vi.fn(),
    updateClientConsultant: vi.fn(),
    getOrganization: vi.fn(),
  },
}));

vi.mock('../../../services/CsvImportService', () => ({
  default: {
    importConsultants: vi.fn(),
    importDebts: vi.fn(),
    importClients: vi.fn(),
  },
}));

vi.mock('../../../services/DebtService', () => ({
  default: {
    adminCreateDebt: vi.fn(),
    adminUpdateDebtStatus: vi.fn(),
    listByWeek: vi.fn(),
    listPaidToday: vi.fn(),
  },
}));

vi.mock('../../../services/PaymentService', () => ({
  default: {
    listPaidDocuments: vi.fn(),
  },
}));

vi.mock('../../../services/SettingsService', () => ({
  default: {
    getAll: vi.fn(),
    setMany: vi.fn(),
  },
}));

import adminController from '../../../controllers/AdminController';
import userService from '../../../services/UserService';

const makeReq = (params: Record<string, string> = {}, body: Record<string, unknown> = {}, query: Record<string, unknown> = {}) => ({
  user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' },
  params,
  body,
  query,
  file: undefined,
}) as any;

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const makeNext = () => vi.fn();

beforeEach(() => vi.clearAllMocks());

describe('AdminController.updateUser — whitelist de campos', () => {
  it('permite campos válidos: name, email, role, isActive, phone', async () => {
    vi.mocked(userService.update).mockResolvedValueOnce({ id: 'u1', name: 'Updated' } as any);

    const req = makeReq({ id: 'u1' }, { name: 'Updated', email: 'new@test.com', role: 'LIDER', isActive: true, phone: '119999' });
    const res = makeRes();
    await adminController.updateUser(req, res, makeNext());

    expect(userService.update).toHaveBeenCalledWith('u1', expect.objectContaining({
      name: 'Updated', email: 'new@test.com', role: 'LIDER', isActive: true, phone: '119999',
    }));
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
  });

  it('filtra campos proibidos: password, cpf, id, createdAt', async () => {
    vi.mocked(userService.update).mockResolvedValueOnce({ id: 'u1' } as any);

    const req = makeReq({ id: 'u1' }, {
      name: 'OK', password: 'hacked', cpf: '99999999999', id: 'fake-id', createdAt: '2020-01-01',
    });
    const res = makeRes();
    await adminController.updateUser(req, res, makeNext());

    const passedData = vi.mocked(userService.update).mock.calls[0][1] as Record<string, unknown>;
    expect(passedData.password).toBeUndefined();
    expect(passedData.cpf).toBeUndefined();
    expect(passedData.id).toBeUndefined();
    expect(passedData.createdAt).toBeUndefined();
    expect(passedData.name).toBe('OK');
  });

  it('hasheia password quando presente no campo dedicado newPassword', async () => {
    vi.mocked(userService.update).mockResolvedValueOnce({ id: 'u1' } as any);

    const req = makeReq({ id: 'u1' }, { newPassword: 'senhaSegura123' });
    const res = makeRes();
    await adminController.updateUser(req, res, makeNext());

    const passedData = vi.mocked(userService.update).mock.calls[0][1] as Record<string, unknown>;
    // Should be a bcrypt hash, not the plaintext
    expect(passedData.password).toBeDefined();
    expect(passedData.password).not.toBe('senhaSegura123');
    expect(String(passedData.password).startsWith('$2')).toBe(true);
  });
});
