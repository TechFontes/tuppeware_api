import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Setup do PrismaClient (mesmo padrao de src/config/database.ts)
// ---------------------------------------------------------------------------
const url = new URL(process.env.DATABASE_URL || '');

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  connectionLimit: 5,
});

const prisma = new PrismaClient({
  adapter,
} as ConstructorParameters<typeof PrismaClient>[0]);

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------
function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** Calcula diasAtraso dinamicamente: dias corridos desde a data de vencimento até hoje. */
function calcDiasAtraso(dataVencimento: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - dataVencimento.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

// ---------------------------------------------------------------------------
// Dados de seed
// ---------------------------------------------------------------------------
const DEFAULT_PASSWORD = '123456';

const GERENTE = {
  name: 'Gerente Sistema',
  cpf: '86904980029', // CPF valido de teste
  email: 'gerente@tuppeware.com',
  role: 'GERENTE' as const,
};

const ADMIN = {
  name: 'Administrador',
  cpf: '52998224725', // CPF valido de teste
  email: 'admin@tuppeware.com',
  role: 'ADMIN' as const,
};

const CONSULTANTS = [
  {
    user: {
      name: 'Maria Empresaria',
      cpf: '11144477735', // CPF valido de teste
      email: 'maria@tuppeware.com',
      role: 'EMPRESARIA' as const,
    },
    consultant: {
      codigo: 'EMP001',
      tipo: 1,
      grupo: 'G01',
      distrito: 'D01',
      cpf: '11144477735',
    },
  },
  {
    user: {
      name: 'Ana Lider',
      cpf: '71428793860', // CPF valido de teste
      email: 'ana@tuppeware.com',
      role: 'LIDER' as const,
    },
    consultant: {
      codigo: 'LID001',
      tipo: 2,
      grupo: 'G01',
      distrito: 'D01',
      cpf: '71428793860',
    },
  },
  {
    user: {
      name: 'Julia Consultora',
      cpf: '45632178901', // CPF valido de teste
      email: 'julia@tuppeware.com',
      role: 'CONSULTOR' as const,
    },
    consultant: {
      codigo: 'CON001',
      tipo: 3,
      grupo: 'G01',
      distrito: 'D01',
      cpf: '45632178901',
    },
  },
  {
    user: {
      name: 'Carla Consultora',
      cpf: '07265702042', // CPF valido de teste
      email: 'carla@tuppeware.com',
      role: 'CONSULTOR' as const,
    },
    consultant: {
      codigo: 'CON002',
      tipo: 3,
      grupo: 'G02',
      distrito: 'D02',
      cpf: '07265702042',
    },
  },
];

// ---------------------------------------------------------------------------
// Débitos: diasAtraso calculado automaticamente de dataVencimento
// ---------------------------------------------------------------------------
function makeDebts() {
  const d = [
    // --- EMP001 (Maria) ---
    // PENDENTE: vence no futuro
    { codigo: 'EMP001', nome: 'Maria Empresaria', grupo: 'G01', distrito: 'D01', semana: 'S01', valor: 150.00,  dataVencimento: daysFromNow(15), numeroNf: 'NF-2025-001', status: 'PENDENTE' as const },
    // ATRASADO: venceu há 10 dias (sem pagamento)
    { codigo: 'EMP001', nome: 'Maria Empresaria', grupo: 'G01', distrito: 'D01', semana: 'S02', valor: 320.50,  dataVencimento: daysAgo(10),     numeroNf: 'NF-2025-002', status: 'ATRASADO' as const },
    // PAGO: venceu há 5 dias e foi pago (terá payment)
    { codigo: 'EMP001', nome: 'Maria Empresaria', grupo: 'G01', distrito: 'D01', semana: 'S03', valor: 89.90,   dataVencimento: daysAgo(5),      numeroNf: 'NF-2025-003', status: 'PAGO'     as const },

    // --- LID001 (Ana) ---
    // PENDENTE: vence em 30 dias
    { codigo: 'LID001', nome: 'Ana Lider',        grupo: 'G01', distrito: 'D01', semana: 'S01', valor: 540.00,  dataVencimento: daysFromNow(30), numeroNf: 'NF-2025-004', status: 'PENDENTE' as const },
    // ATRASADO: venceu há 25 dias
    { codigo: 'LID001', nome: 'Ana Lider',        grupo: 'G01', distrito: 'D01', semana: 'S02', valor: 1250.00, dataVencimento: daysAgo(25),     numeroNf: 'NF-2025-005', status: 'ATRASADO' as const },
    // PAGO: venceu há 8 dias e foi pago (terá payment)
    { codigo: 'LID001', nome: 'Ana Lider',        grupo: 'G01', distrito: 'D01', semana: 'S03', valor: 75.00,   dataVencimento: daysAgo(8),      numeroNf: 'NF-2025-006', status: 'PAGO'     as const },

    // --- CON001 (Julia) ---
    // PENDENTE: vence em 7 dias
    { codigo: 'CON001', nome: 'Julia Consultora', grupo: 'G01', distrito: 'D01', semana: 'S01', valor: 200.00,  dataVencimento: daysFromNow(7),  numeroNf: 'NF-2025-007', status: 'PENDENTE' as const },
    // ATRASADO: venceu há 15 dias
    { codigo: 'CON001', nome: 'Julia Consultora', grupo: 'G01', distrito: 'D01', semana: 'S02', valor: 450.75,  dataVencimento: daysAgo(15),     numeroNf: 'NF-2025-008', status: 'ATRASADO' as const },
    // PENDENTE: vence em 45 dias (alto valor, testa parcelamento)
    { codigo: 'CON001', nome: 'Julia Consultora', grupo: 'G01', distrito: 'D01', semana: 'S03', valor: 1500.00, dataVencimento: daysFromNow(45), numeroNf: 'NF-2025-009', status: 'PENDENTE' as const },
    // PAGO: venceu há 3 dias e foi pago (terá payment)
    { codigo: 'CON001', nome: 'Julia Consultora', grupo: 'G01', distrito: 'D01', semana: 'S04', valor: 60.00,   dataVencimento: daysAgo(3),      numeroNf: 'NF-2025-010', status: 'PAGO'     as const },

    // --- CON002 (Carla) — grupo/distrito diferente para testar filtros ---
    { codigo: 'CON002', nome: 'Carla Consultora', grupo: 'G02', distrito: 'D02', semana: 'S01', valor: 180.00,  dataVencimento: daysFromNow(10), numeroNf: 'NF-2025-011', status: 'PENDENTE' as const },
    { codigo: 'CON002', nome: 'Carla Consultora', grupo: 'G02', distrito: 'D02', semana: 'S02', valor: 95.00,   dataVencimento: daysAgo(6),      numeroNf: 'NF-2025-012', status: 'ATRASADO' as const },
  ];

  // Injeta diasAtraso calculado dinamicamente
  return d.map(debt => ({
    ...debt,
    diasAtraso: calcDiasAtraso(debt.dataVencimento),
  }));
}

// ---------------------------------------------------------------------------
// Funcao principal
// ---------------------------------------------------------------------------
async function main() {
  console.info('Iniciando seed do banco de dados...\n');

  // 1. Limpa tabelas na ordem reversa das dependencias (FKs)
  console.info('Limpando tabelas...');
  await prisma.paymentDebt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.savedCard.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  console.info('Tabelas limpas.\n');

  // 2. Hash da senha padrão
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // 3. Cria usuário GERENTE (hierarquia acima do ADMIN)
  console.info('Criando usuario GERENTE...');
  const gerente = await prisma.user.create({
    data: { name: GERENTE.name, cpf: GERENTE.cpf, email: GERENTE.email, password: hashedPassword, role: GERENTE.role },
  });
  console.info(`  GERENTE: ${gerente.email} (senha: ${DEFAULT_PASSWORD})`);

  // 4. Cria usuário ADMIN
  console.info('Criando usuario ADMIN...');
  const admin = await prisma.user.create({
    data: { name: ADMIN.name, cpf: ADMIN.cpf, email: ADMIN.email, password: hashedPassword, role: ADMIN.role },
  });
  console.info(`  ADMIN: ${admin.email} (senha: ${DEFAULT_PASSWORD})`);

  // 5. Cria consultores com usuários vinculados
  console.info('\nCriando consultores e usuarios...');
  const createdUsers: Record<string, string> = {}; // codigo -> userId

  for (const c of CONSULTANTS) {
    const user = await prisma.user.create({
      data: { name: c.user.name, cpf: c.user.cpf, email: c.user.email, password: hashedPassword, role: c.user.role },
    });

    await prisma.consultant.create({ data: { ...c.consultant, userId: user.id } });

    createdUsers[c.consultant.codigo] = user.id;
    console.info(`  ${c.user.role}: ${c.user.email} | Codigo: ${c.consultant.codigo} | Grupo: ${c.consultant.grupo} | Distrito: ${c.consultant.distrito}`);
  }

  // 6. Cria débitos (diasAtraso calculado dinamicamente)
  console.info('\nCriando debitos...');
  const DEBTS = makeDebts();
  const debtMap: Record<string, string> = {}; // numeroNf -> debtId

  for (const d of DEBTS) {
    const debt = await prisma.debt.create({ data: d });
    debtMap[d.numeroNf] = debt.id;
    console.info(`  ${d.numeroNf} | ${d.nome} | R$ ${d.valor.toFixed(2)} | ${d.status} | diasAtraso: ${d.diasAtraso}`);
  }

  // 7. Cria pagamentos para TODOS os débitos com status PAGO
  console.info('\nCriando pagamentos para debitos PAGO...');
  const paidDebts = DEBTS.filter(d => d.status === 'PAGO');
  let paymentSeq = 1;

  for (const d of paidDebts) {
    const payerUserId = createdUsers[d.codigo];
    if (!payerUserId || !debtMap[d.numeroNf]) continue;

    const seq = String(paymentSeq).padStart(4, '0');
    const payment = await prisma.payment.create({
      data: {
        userId: payerUserId,
        method: 'PIX',
        installments: 1,
        subtotal: d.valor,
        fee: 0,
        totalValue: d.valor,
        status: 'PAGO',
        gatewayProvider: 'EREDE',
        referenceNum: `SEED-REF-${seq}`,
        gatewayTransactionId: `seed-trans-${seq}`,
        gatewayOrderId: `seed-order-${seq}`,
        gatewayStatusCode: '00',
        gatewayStatusMessage: 'SUCCESS',
        processorReference: `seed-auth-${seq}`,
        paymentLink: null,
        qrCode: null,
        paymentDebts: { create: { debtId: debtMap[d.numeroNf] } },
      },
    });
    console.info(`  Pagamento ${payment.id} | PIX | R$ ${d.valor.toFixed(2)} | NF: ${d.numeroNf}`);
    paymentSeq++;
  }

  // 8. Cria 1 pagamento PENDENTE (link ativo) para testar o limite de links e reopen
  console.info('\nCriando pagamento PENDENTE de exemplo (teste de link ativo)...');
  const pendingDebt = DEBTS.find(d => d.status === 'PENDENTE' && d.codigo === 'CON001');
  if (pendingDebt && createdUsers['CON001']) {
    await prisma.payment.create({
      data: {
        userId: createdUsers['CON001'],
        method: 'PIX',
        installments: 1,
        subtotal: pendingDebt.valor,
        fee: 0,
        totalValue: pendingDebt.valor,
        status: 'PENDENTE',
        gatewayProvider: 'EREDE',
        referenceNum: 'SEED-REF-PEND',
        gatewayTransactionId: 'seed-trans-pend',
        gatewayOrderId: 'seed-order-pend',
        gatewayStatusCode: '06',
        gatewayStatusMessage: 'PENDING',
        processorReference: null,
        paymentLink: 'https://sandbox.example.com/pix/seed-pend',
        qrCode: '00020126360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540520.005802BR5913TUPPEWARE6008SAOPAULO62070503***6304ABCD',
        paymentDebts: { create: { debtId: debtMap[pendingDebt.numeroNf] } },
      },
    });
    console.info(`  Pagamento PENDENTE criado | NF: ${pendingDebt.numeroNf} | R$ ${pendingDebt.valor.toFixed(2)}`);
  }

  // 9. Configurações padrão
  console.info('\nCriando configurações padrão...');
  await prisma.setting.upsert({
    where: { key: 'max_active_payment_links' },
    update: { value: '5' },
    create: { key: 'max_active_payment_links', value: '5' },
  });
  console.info('  max_active_payment_links = 5');

  // Resumo
  const totalUsers = CONSULTANTS.length + 2; // +GERENTE +ADMIN
  const totalPayments = paidDebts.length + 1; // +1 PENDENTE
  console.info('\n========================================');
  console.info('Seed concluido com sucesso!');
  console.info('========================================');
  console.info(`  Usuarios:     ${totalUsers} (1 GERENTE + 1 ADMIN + ${CONSULTANTS.length} consultores)`);
  console.info(`  Consultores:  ${CONSULTANTS.length}`);
  console.info(`  Debitos:      ${DEBTS.length}`);
  console.info(`  Pagamentos:   ${totalPayments} (${paidDebts.length} PAGO + 1 PENDENTE)`);
  console.info(`  Settings:     1`);
  console.info(`  Senha padrao: ${DEFAULT_PASSWORD}`);
  console.info('');
  console.info('  Credenciais de acesso:');
  console.info(`    GERENTE:    gerente@tuppeware.com  / ${DEFAULT_PASSWORD}`);
  console.info(`    ADMIN:      admin@tuppeware.com    / ${DEFAULT_PASSWORD}`);
  console.info(`    EMPRESARIA: maria@tuppeware.com    / ${DEFAULT_PASSWORD}`);
  console.info(`    LIDER:      ana@tuppeware.com      / ${DEFAULT_PASSWORD}`);
  console.info(`    CONSULTOR:  julia@tuppeware.com    / ${DEFAULT_PASSWORD}`);
  console.info(`    CONSULTOR:  carla@tuppeware.com    / ${DEFAULT_PASSWORD}`);
  console.info('========================================\n');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
