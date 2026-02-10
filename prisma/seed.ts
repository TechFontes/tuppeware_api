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
// Dados de seed
// ---------------------------------------------------------------------------
const DEFAULT_PASSWORD = '123456';

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
];

function daysAgo(days: number): Date {
  const d = new Date();

  d.setDate(d.getDate() - days);

  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();

  d.setDate(d.getDate() + days);

  return d;
}

const DEBTS = [
  // Debitos da Empresaria (codigo EMP001)
  { codigo: 'EMP001', nome: 'Maria Empresaria', grupo: 'G01', distrito: 'D01', semana: 'S01', valor: 150.00,  diasAtraso: 0,  dataVencimento: daysFromNow(15), numeroNf: 'NF-2025-001', status: 'PENDENTE' as const },
  { codigo: 'EMP001', nome: 'Maria Empresaria', grupo: 'G01', distrito: 'D01', semana: 'S02', valor: 320.50,  diasAtraso: 10, dataVencimento: daysAgo(10),     numeroNf: 'NF-2025-002', status: 'ATRASADO' as const },
  { codigo: 'EMP001', nome: 'Maria Empresaria', grupo: 'G01', distrito: 'D01', semana: 'S03', valor: 89.90,   diasAtraso: 0,  dataVencimento: daysAgo(5),      numeroNf: 'NF-2025-003', status: 'PAGO'     as const },

  // Debitos da Lider (codigo LID001)
  { codigo: 'LID001', nome: 'Ana Lider',        grupo: 'G01', distrito: 'D01', semana: 'S01', valor: 540.00,  diasAtraso: 0,  dataVencimento: daysFromNow(30), numeroNf: 'NF-2025-004', status: 'PENDENTE' as const },
  { codigo: 'LID001', nome: 'Ana Lider',        grupo: 'G01', distrito: 'D01', semana: 'S02', valor: 1250.00, diasAtraso: 25, dataVencimento: daysAgo(25),     numeroNf: 'NF-2025-005', status: 'ATRASADO' as const },
  { codigo: 'LID001', nome: 'Ana Lider',        grupo: 'G01', distrito: 'D01', semana: 'S03', valor: 75.00,   diasAtraso: 0,  dataVencimento: daysAgo(3),      numeroNf: 'NF-2025-006', status: 'PAGO'     as const },

  // Debitos da Consultora (codigo CON001)
  { codigo: 'CON001', nome: 'Julia Consultora',  grupo: 'G01', distrito: 'D01', semana: 'S01', valor: 200.00,  diasAtraso: 0,  dataVencimento: daysFromNow(7),  numeroNf: 'NF-2025-007', status: 'PENDENTE' as const },
  { codigo: 'CON001', nome: 'Julia Consultora',  grupo: 'G01', distrito: 'D01', semana: 'S02', valor: 450.75,  diasAtraso: 15, dataVencimento: daysAgo(15),     numeroNf: 'NF-2025-008', status: 'ATRASADO' as const },
  { codigo: 'CON001', nome: 'Julia Consultora',  grupo: 'G01', distrito: 'D01', semana: 'S03', valor: 1500.00, diasAtraso: 0,  dataVencimento: daysFromNow(45), numeroNf: 'NF-2025-009', status: 'PENDENTE' as const },
  { codigo: 'CON001', nome: 'Julia Consultora',  grupo: 'G01', distrito: 'D01', semana: 'S04', valor: 60.00,   diasAtraso: 0,  dataVencimento: daysAgo(1),      numeroNf: 'NF-2025-010', status: 'PAGO'     as const },
];

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
  await prisma.debt.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.user.deleteMany();
  console.info('Tabelas limpas.\n');

  // 2. Hash da senha padrao
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // 3. Cria usuario admin
  console.info('Criando usuario admin...');
  const admin = await prisma.user.create({
    data: {
      name: ADMIN.name,
      cpf: ADMIN.cpf,
      email: ADMIN.email,
      password: hashedPassword,
      role: ADMIN.role,
    },
  });

  console.info(`  Admin: ${admin.email} (senha: ${DEFAULT_PASSWORD})`);

  // 4. Cria consultores com usuarios vinculados
  console.info('\nCriando consultores e usuarios...');
  const createdUsers: Record<string, string> = {}; // codigo -> userId

  for (const c of CONSULTANTS) {
    const user = await prisma.user.create({
      data: {
        name: c.user.name,
        cpf: c.user.cpf,
        email: c.user.email,
        password: hashedPassword,
        role: c.user.role,
      },
    });

    await prisma.consultant.create({
      data: {
        ...c.consultant,
        userId: user.id,
      },
    });

    createdUsers[c.consultant.codigo] = user.id;
    console.info(`  ${c.user.role}: ${c.user.email} | Codigo: ${c.consultant.codigo}`);
  }

  // 5. Cria debitos
  console.info('\nCriando debitos...');
  const debtIds: { id: string; status: string; codigo: string }[] = [];

  for (const d of DEBTS) {
    const debt = await prisma.debt.create({
      data: d,
    });

    debtIds.push({ id: debt.id, status: d.status, codigo: d.codigo });
    console.info(`  ${d.numeroNf} | ${d.nome} | R$ ${d.valor.toFixed(2)} | ${d.status}`);
  }

  // 6. Cria um pagamento de exemplo (debito PAGO da Maria - NF-2025-003)
  console.info('\nCriando pagamento de exemplo...');
  const paidDebt = debtIds.find((d) => d.status === 'PAGO' && d.codigo === 'EMP001');
  const payerUserId = createdUsers['EMP001'];

  if (paidDebt && payerUserId) {
    const payment = await prisma.payment.create({
      data: {
        userId: payerUserId,
        method: 'PIX',
        installments: 1,
        subtotal: 89.90,
        fee: 0,
        totalValue: 89.90,
        status: 'PAGO',
        paymentLink: 'https://sandbox.asaas.com/example-link',
        asaasId: 'pay_seed_001',
        paymentDebts: {
          create: {
            debtId: paidDebt.id,
          },
        },
      },
    });

    console.info(`  Pagamento ${payment.id} | PIX | R$ 89,90 | PAGO`);
  }

  // Resumo
  console.info('\n========================================');
  console.info('Seed concluido com sucesso!');
  console.info('========================================');
  console.info(`  Usuarios:     ${CONSULTANTS.length + 1} (1 admin + ${CONSULTANTS.length} consultores)`);
  console.info(`  Consultores:  ${CONSULTANTS.length}`);
  console.info(`  Debitos:      ${DEBTS.length}`);
  console.info(`  Pagamentos:   1`);
  console.info(`  Senha padrao: ${DEFAULT_PASSWORD}`);
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
