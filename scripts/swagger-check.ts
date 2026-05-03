/**
 * Smoke check do Swagger spec gerado.
 *
 * Valida cobertura mínima do contrato OpenAPI para garantir que mudanças
 * acidentais (ex: deletar uma anotação) não passem despercebidas.
 *
 * Uso: `npm run swagger:check`. Sai com código 1 se algum threshold falhar.
 */

import { swaggerSpec } from '../src/config/swagger';

interface OpenAPIDocument {
  paths?: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
  tags?: unknown[];
  servers?: unknown[];
  security?: unknown[];
}

const spec = swaggerSpec as OpenAPIDocument;

const paths = Object.keys(spec.paths ?? {}).length;
const schemas = Object.keys(spec.components?.schemas ?? {}).length;
const tags = spec.tags?.length ?? 0;
const servers = spec.servers?.length ?? 0;
const hasGlobalSecurity = Array.isArray(spec.security) && spec.security.length > 0;

console.log('---');
console.log('Swagger spec health check');
console.log('---');
console.log(`paths:           ${paths}`);
console.log(`schemas:         ${schemas}`);
console.log(`tags:            ${tags}`);
console.log(`servers:         ${servers}`);
console.log(`global security: ${hasGlobalSecurity}`);
console.log('---');

const thresholds = {
  paths: 30,
  schemas: 22,
  tags: 7,
  servers: 2,
};

const failures: string[] = [];
if (paths < thresholds.paths) failures.push(`paths: ${paths} < ${thresholds.paths}`);
if (schemas < thresholds.schemas) failures.push(`schemas: ${schemas} < ${thresholds.schemas}`);
if (tags < thresholds.tags) failures.push(`tags: ${tags} < ${thresholds.tags}`);
if (servers < thresholds.servers) failures.push(`servers: ${servers} < ${thresholds.servers}`);
if (!hasGlobalSecurity) failures.push('global security ausente');

if (failures.length > 0) {
  console.error('FAIL:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('OK — todos os thresholds atendidos.');
