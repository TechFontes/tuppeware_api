import bcrypt from 'bcryptjs';
import prisma from '../../config/database';

export async function createUser(overrides: {
  name?: string;
  cpf?: string;
  email?: string;
  password?: string;
  role?: 'ADMIN' | 'GERENTE' | 'EMPRESARIA' | 'LIDER' | 'CONSULTOR';
  isActive?: boolean;
} = {}) {
  const password = overrides.password || 'Senha@123';
  const hash = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      name: overrides.name || 'Test User',
      cpf: overrides.cpf || '11144477735',
      email: overrides.email || `test-${Date.now()}@email.com`,
      password: hash,
      role: overrides.role || 'CONSULTOR',
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function createConsultant(userId: string, overrides: {
  codigo?: string;
  tipo?: number;
  grupo?: string;
  distrito?: string;
  cpf?: string;
} = {}) {
  return prisma.consultant.create({
    data: {
      codigo: overrides.codigo || `C${Date.now()}`,
      tipo: overrides.tipo || 3,
      grupo: overrides.grupo || 'G-TEST',
      distrito: overrides.distrito || 'D-TEST',
      cpf: overrides.cpf || '11144477735',
      userId,
    },
  });
}

export async function createDebt(overrides: {
  codigo?: string;
  nome?: string;
  grupo?: string;
  distrito?: string;
  valor?: number;
  status?: 'PENDENTE' | 'ATRASADO' | 'PAGO';
  numeroNf?: string;
} = {}) {
  return prisma.debt.create({
    data: {
      codigo: overrides.codigo || 'C001',
      nome: overrides.nome || 'Consultora Test',
      grupo: overrides.grupo || 'G-TEST',
      distrito: overrides.distrito || 'D-TEST',
      semana: 'S01/2026',
      valor: overrides.valor || 150,
      diasAtraso: 0,
      dataVencimento: new Date('2026-06-01'),
      numeroNf: overrides.numeroNf || `NF-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: overrides.status || 'PENDENTE',
    },
  });
}

export async function cleanDatabase() {
  await prisma.paymentDebt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.savedCard.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.user.deleteMany();
}
