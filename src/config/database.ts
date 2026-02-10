import { PrismaClient } from '../../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

class Database {
  private static instance: PrismaClient;

  constructor() {
    if (!Database.instance) {
      const url = new URL(process.env.DATABASE_URL || '');

      const adapter = new PrismaMariaDb({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        connectionLimit: 5,
      });

      Database.instance = new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      } as ConstructorParameters<typeof PrismaClient>[0]);
    }
  }

  getInstance(): PrismaClient {
    return Database.instance;
  }
}

const database = new Database();
const prisma = database.getInstance();

export default prisma;
