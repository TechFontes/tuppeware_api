import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/ConsultantRepository', () => ({
  default: {
    upsertByCpf: vi.fn(),
    findByCpf: vi.fn(),
    linkToUser: vi.fn(),
  },
}));

vi.mock('../../../repositories/DebtRepository', () => ({
  default: {
    upsertByNf: vi.fn(),
  },
}));

vi.mock('../../../repositories/UserRepository', () => ({
  default: {
    findByCpf: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

import csvImportService from '../../../services/CsvImportService';
import consultantRepository from '../../../repositories/ConsultantRepository';
import debtRepository from '../../../repositories/DebtRepository';
import userRepository from '../../../repositories/UserRepository';

const makeCsvBuffer = (content: string): Buffer => Buffer.from(content, 'utf-8');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CsvImportService.importClients — senha inicial (CRIT-08)', () => {
  it('não usa CPF como senha ao criar novo usuário', async () => {
    const cpf = '11144477735';
    const csvContent = `C001;João Silva;${cpf};joao@email.com;CONSULTOR;GrupoA;DistritoB`;

    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockImplementationOnce(async (data: any) => ({
      id: 'user-new',
      name: data.name,
      cpf: data.cpf,
      email: data.email,
      role: data.role || 'CONSULTOR',
      isActive: true,
      password: data.password,
      phone: null, birthDate: null, address: null, addressNumber: null,
      addressComplement: null, neighbourhood: null, city: null, state: null,
      postalCode: null, consultant: null, createdAt: new Date(), updatedAt: new Date(),
    }));
    vi.mocked(consultantRepository.upsertByCpf).mockResolvedValueOnce({ id: 'c1', userId: null } as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({ id: 'c1', userId: null } as any);
    vi.mocked(consultantRepository.linkToUser).mockResolvedValueOnce({} as any);

    await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(userRepository.create).toHaveBeenCalledOnce();

    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    // Senha não deve ser o CPF em texto puro
    expect(createCall.password).not.toBe(cpf);

    // Verificação: CPF não deve ser a senha (comparação bcrypt)
    const bcrypt = await import('bcryptjs');
    const isCpfPassword = await bcrypt.compare(cpf, createCall.password);
    expect(isCpfPassword).toBe(false);
  });

  it('a senha inicial é um hash bcrypt válido', async () => {
    const cpf = '11144477735';
    const csvContent = `C001;João Silva;${cpf};joao@email.com;CONSULTOR;GrupoA;DistritoB`;

    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockImplementationOnce(async (data: any) => ({
      id: 'user-new', name: data.name, cpf: data.cpf, email: data.email,
      role: 'CONSULTOR', isActive: true, password: data.password,
      phone: null, birthDate: null, address: null, addressNumber: null,
      addressComplement: null, neighbourhood: null, city: null, state: null,
      postalCode: null, consultant: null, createdAt: new Date(), updatedAt: new Date(),
    }));
    vi.mocked(consultantRepository.upsertByCpf).mockResolvedValueOnce({ id: 'c1', userId: null } as any);
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({ id: 'c1', userId: null } as any);
    vi.mocked(consultantRepository.linkToUser).mockResolvedValueOnce({} as any);

    await csvImportService.importClients(makeCsvBuffer(csvContent));

    const createCall = vi.mocked(userRepository.create).mock.calls[0][0];
    // Deve ser um hash bcrypt (começa com $2a$ ou $2b$)
    expect(createCall.password).toMatch(/^\$2[ab]\$/);
  });
});

describe('CsvImportService.importDebts', () => {
  it('processa CSV de débitos válido (formato: sem dias_atraso, com status)', async () => {
    // Formato real: codigo;nome;grupo;distrito;semana;valor;data_vencimento;numero_nf;status
    const csvContent = `C001;João Silva;GrupoA;DistritoB;S01;150.00;2024-01-15;NF001;PENDENTE`;

    vi.mocked(debtRepository.upsertByNf).mockResolvedValueOnce({} as any);

    const result = await csvImportService.importDebts(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('retorna erro para CSV vazio', async () => {
    await expect(csvImportService.importDebts(makeCsvBuffer('')))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('calcula diasAtraso automaticamente a partir de data_vencimento', async () => {
    // Data no passado para garantir atraso > 0
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    const dateStr = pastDate.toISOString().split('T')[0];
    const csvContent = `C001;João Silva;GrupoA;DistritoB;S01;150.00;${dateStr};NF002`;

    vi.mocked(debtRepository.upsertByNf).mockResolvedValueOnce({} as any);

    await csvImportService.importDebts(makeCsvBuffer(csvContent));

    const upsertCall = vi.mocked(debtRepository.upsertByNf).mock.calls[0][0];
    expect(upsertCall.diasAtraso).toBeGreaterThan(0);
  });
});

describe('CsvImportService.importConsultants', () => {
  it('processa CSV de consultores válido (formato: codigo;tipo;grupo;distrito;CPF)', async () => {
    const csvContent = `C001;3;GrupoA;DistritoB;11144477735`;

    vi.mocked(consultantRepository.upsertByCpf).mockResolvedValueOnce({ id: 'c1', userId: null } as any);
    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);

    const result = await csvImportService.importConsultants(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(1);
  });

  it('retorna erro para tipo inválido (fora de 1, 2, 3)', async () => {
    const csvContent = `C001;9;GrupoA;DistritoB;11144477735`;

    const result = await csvImportService.importConsultants(makeCsvBuffer(csvContent));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Tipo inválido');
  });
});
