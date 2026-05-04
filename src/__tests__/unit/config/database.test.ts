import { describe, it, expect } from 'vitest';
import { parseDatabaseUrl } from '../../../config/database';

describe('config/database — parseDatabaseUrl', () => {
  const baseUrl = 'mysql://user:pass@dbhost:3307/mydb';

  it('extrai host/port/user/password/database da URL básica', () => {
    const cfg = parseDatabaseUrl(baseUrl);
    expect(cfg).toMatchObject({
      host: 'dbhost',
      port: 3307,
      user: 'user',
      password: 'pass',
      database: 'mydb',
    });
  });

  it('aplica connectionLimit padrão de 5 quando não informado na query', () => {
    const cfg = parseDatabaseUrl(baseUrl);
    expect(cfg.connectionLimit).toBe(5);
  });

  it('usa porta padrão 3306 quando URL não declara porta', () => {
    const cfg = parseDatabaseUrl('mysql://u:p@h/db');
    expect(cfg.port).toBe(3306);
  });

  it('propaga allowPublicKeyRetrieval=true como boolean', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?allowPublicKeyRetrieval=true`);
    expect(cfg.allowPublicKeyRetrieval).toBe(true);
  });

  it('propaga allowPublicKeyRetrieval=false como boolean', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?allowPublicKeyRetrieval=false`);
    expect(cfg.allowPublicKeyRetrieval).toBe(false);
  });

  it('propaga connectTimeout como number', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?connectTimeout=5000`);
    expect(cfg.connectTimeout).toBe(5000);
  });

  it('propaga socketTimeout como number', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?socketTimeout=30000`);
    expect(cfg.socketTimeout).toBe(30000);
  });

  it('propaga ssl=true como boolean', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?ssl=true`);
    expect(cfg.ssl).toBe(true);
  });

  it('connectionLimit da query string sobrescreve o default', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?connectionLimit=20`);
    expect(cfg.connectionLimit).toBe(20);
  });

  it('combina múltiplas options da query string', () => {
    const cfg = parseDatabaseUrl(
      `${baseUrl}?allowPublicKeyRetrieval=true&connectTimeout=10000&connectionLimit=15`,
    );
    expect(cfg).toMatchObject({
      host: 'dbhost',
      port: 3307,
      user: 'user',
      password: 'pass',
      database: 'mydb',
      allowPublicKeyRetrieval: true,
      connectTimeout: 10000,
      connectionLimit: 15,
    });
  });

  it('ignora options fora da whitelist (não vaza pra config)', () => {
    const cfg = parseDatabaseUrl(`${baseUrl}?fooBar=baz&multipleStatements=true`);
    expect(cfg).not.toHaveProperty('fooBar');
    expect(cfg).not.toHaveProperty('multipleStatements');
  });

  it('decodifica URL-encoded password com caracteres especiais', () => {
    const cfg = parseDatabaseUrl('mysql://u:p%40ss%21@h:3306/db');
    expect(cfg.password).toBe('p@ss!');
  });
});
