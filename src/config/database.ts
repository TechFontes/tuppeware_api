import { PrismaClient } from '../../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

type AdapterConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  allowPublicKeyRetrieval?: boolean;
  connectTimeout?: number;
  socketTimeout?: number;
  ssl?: boolean;
};

const BOOLEAN_OPTIONS = ['allowPublicKeyRetrieval', 'ssl'] as const;
const NUMERIC_OPTIONS = ['connectTimeout', 'socketTimeout', 'connectionLimit'] as const;

export function parseDatabaseUrl(databaseUrl: string): AdapterConfig {
  const url = new URL(databaseUrl);

  const config: AdapterConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 5,
  };

  for (const key of BOOLEAN_OPTIONS) {
    const raw = url.searchParams.get(key);
    if (raw !== null) {
      config[key] = raw === 'true';
    }
  }

  for (const key of NUMERIC_OPTIONS) {
    const raw = url.searchParams.get(key);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        config[key] = parsed;
      }
    }
  }

  return config;
}

let instance: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!instance) {
    const adapter = new PrismaMariaDb(parseDatabaseUrl(process.env.DATABASE_URL || ''));
    instance = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    } as ConstructorParameters<typeof PrismaClient>[0]);
  }
  return instance;
}

export default new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? (value as Function).bind(client) : value;
  },
});
