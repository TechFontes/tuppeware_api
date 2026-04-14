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

describe('CsvImportService.importClients — validações de entrada', () => {
  it('lança AppError quando CSV de clientes está vazio (linha 230)', async () => {
    await expect(csvImportService.importClients(makeCsvBuffer('')))
      .rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('registra erro quando campos obrigatórios estão ausentes (linhas 241-242)', async () => {
    // Sem código (primeiro campo vazio)
    const csvContent = `;João Silva;11144477735;joao@email.com;CONSULTOR;GrupoA;DistritoB`;

    const result = await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Campos obrigatórios ausentes');
  });
});

describe('CsvImportService.importDebts — branches de validação', () => {
  it('captura erro de repositório e registra como linha com erro (linha 209)', async () => {
    const csvContent = `C001;João Silva;GrupoA;DistritoB;S01;150.00;2024-01-15;NF001`;

    vi.mocked(debtRepository.upsertByNf).mockRejectedValueOnce(new Error('DB timeout'));

    const result = await csvImportService.importDebts(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('DB timeout');
  });

  it('registra erro quando valor é inválido (linhas 163-164)', async () => {
    const csvContent = `C001;João Silva;GrupoA;DistritoB;S01;abc;2024-01-15;NF001`;

    const result = await csvImportService.importDebts(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Valor inválido/i);
  });

  it('registra erro quando valor é zero ou negativo (linhas 163-164)', async () => {
    const csvContent = `C001;João Silva;GrupoA;DistritoB;S01;0;2024-01-15;NF001`;

    const result = await csvImportService.importDebts(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Valor inválido/i);
  });
});

describe('CsvImportService.importClients — branches de cobertura', () => {
  it('registra erro e continua quando role é inválida (linha 257)', async () => {
    const cpf = '11144477735';
    const csvContent = `C001;João Silva;${cpf};joao@email.com;INVALIDA;GrupoA;DistritoB`;

    const result = await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Role inválida/i);
    // Não deve tentar criar usuário
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('chama upsertByCpf quando usuário existente tem consultant vinculado (linhas 265-266)', async () => {
    const cpf = '11144477735';
    const csvContent = `C001;João Silva;${cpf};joao@email.com;CONSULTOR;GrupoNovo;DistritoNovo`;

    const existingUser = {
      id: 'user-existing',
      name: 'João Silva',
      cpf,
      email: 'joao@email.com',
      role: 'CONSULTOR',
      isActive: true,
      password: 'hashed',
      phone: null,
      birthDate: null,
      address: null,
      addressNumber: null,
      addressComplement: null,
      neighbourhood: null,
      city: null,
      state: null,
      postalCode: null,
      consultant: {
        id: 'c1',
        codigo: 'C001',
        tipo: 3,
        grupo: 'GrupoVelho',
        distrito: 'DistritoVelho',
        cpf,
        userId: 'user-existing',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(existingUser as any);
    vi.mocked(consultantRepository.upsertByCpf).mockResolvedValueOnce({ id: 'c1', userId: 'user-existing' } as any);

    const result = await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(result.success).toBe(1);
    expect(result.errors).toHaveLength(0);
    // Deve atualizar o consultant do usuário existente
    expect(consultantRepository.upsertByCpf).toHaveBeenCalledWith(
      expect.objectContaining({ grupo: 'GrupoNovo', distrito: 'DistritoNovo', cpf }),
    );
    // Não deve criar novo usuário
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('registra erro quando CPF fornecido no CSV é inválido (linhas 248-249)', async () => {
    // CPF com todos os dígitos iguais é inválido (ex: 111.111.111-11 → 11111111111)
    const csvContent = `C001;João Silva;11111111111;joao@email.com;CONSULTOR;GrupoA;DistritoB`;

    const result = await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/CPF inválido/i);
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('captura erro de repositório e registra como linha com erro (linha 304)', async () => {
    const cpf = '11144477735';
    const csvContent = `C001;João Silva;${cpf};joao@email.com;CONSULTOR;GrupoA;DistritoB`;

    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockRejectedValueOnce(new Error('DB connection failed'));

    const result = await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('DB connection failed');
  });

  it('não chama linkToUser quando consultant.userId já está preenchido (linha 304)', async () => {
    const cpf = '11144477735';
    const csvContent = `C001;João Silva;${cpf};joao@email.com;CONSULTOR;GrupoA;DistritoB`;

    vi.mocked(userRepository.findByCpf).mockResolvedValueOnce(null);
    vi.mocked(userRepository.create).mockImplementationOnce(async (data: any) => ({
      id: 'user-new',
      name: data.name,
      cpf: data.cpf,
      email: data.email,
      role: 'CONSULTOR',
      isActive: true,
      password: data.password,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    vi.mocked(consultantRepository.upsertByCpf).mockResolvedValueOnce({ id: 'c1', userId: null } as any);
    // Retorna consultant com userId já definido → não deve chamar linkToUser
    vi.mocked(consultantRepository.findByCpf).mockResolvedValueOnce({ id: 'c1', userId: 'user-new' } as any);

    const result = await csvImportService.importClients(makeCsvBuffer(csvContent));

    expect(result.success).toBe(1);
    expect(consultantRepository.linkToUser).not.toHaveBeenCalled();
  });
});
