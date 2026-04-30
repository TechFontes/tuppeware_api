# eRede Cofre de Cartões + Migração OAuth — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o gateway eRede de Basic Auth para OAuth 2.0, substituir tokenização legada por Cofre de Cartões (`POST /token-service/oauth/v2/tokenization`) e implementar webhook completo com idempotência. Corrige bug em produção `POST /api/users/me/saved-cards` que retornava 503.

**Architecture:** Toda comunicação com a Rede passa a usar Bearer token (gerenciado pelo novo `EredeOAuthClient` com cache em memória + dedupe inflight) + header `Affiliation` (descoberta não documentada). `SavedCard` ganha `tokenizationId`, `status`, `email`, `bin`, `brand_tid`, `last_synced_at`. Novo webhook em `POST /api/erede/webhook` processa eventos de tokenização e transação com idempotência via `Request-ID` e auditoria em `EredeWebhookEvent`.

**Tech Stack:** Node.js + TypeScript, Express 5, Prisma + MariaDB adapter, Vitest, eRede OAuth 2.0 Client Credentials.

**Spec de origem:** `docs/superpowers/specs/2026-04-27-erede-cofre-cartoes-design.md` (todas as 6 seções aprovadas em 2026-04-30).

---

## Princípios de execução

1. **TDD inviolável** (CLAUDE.md): RED → GREEN → REFACTOR. Sem teste falhando, não escreve código.
2. **1 commit por task** (mensagem `feat(erede):` / `refactor(erede):` / etc).
3. **Após cada task, rodar `npm run test` completo** (não só o teste novo). Suite atual = 344 + os adicionados em tasks anteriores.
4. **Após cada task que mexe em `src/`, rodar `npm run lint`**.
5. **NÃO escrever testes de integração** neste plano (decisão B na Pergunta 1 da Seção 6 do spec). Validação manual em sandbox antes do deploy.
6. **Migrations são DDL — não exigem TDD** (não dá pra escrever teste falhando antes da migration). Mas são commit separado e validadas com `prisma:generate` + `prisma:migrate dev`.

## Pré-requisitos antes de iniciar

- [ ] Confirmar que `.env` local tem MySQL/MariaDB acessível (CLAUDE.md: `DATABASE_URL`)
- [ ] Rodar `npm run test` — confirmar baseline 344+ testes passando
- [ ] Confirmar branch atual (deve ser `main`, conforme decisão do usuário)

---

## Task 1: Migration — `SavedCard` cofre fields (ALTER)

**Files:**
- Modify: `prisma/schema.prisma:170-182` — refator do model `SavedCard`
- Modify: `prisma/schema.prisma` — adicionar `enum SavedCardStatus`
- Create: `prisma/migrations/20260430_savedcard_cofre_fields/migration.sql`

**Contexto:** Decisão B na Pergunta 4 da Seção 6 — ALTER preserva dados existentes mesmo que feature nunca tenha funcionado. Novo `tokenizationId` substitui `token`; backfill copia valores existentes. `email` é backfilled via JOIN com `users`. Status inicial PENDING força sync via `assertActiveForCharge` no primeiro uso.

- [ ] **Step 1: Editar `prisma/schema.prisma` — adicionar enum e refatorar model**

Adicionar após o enum `GatewayProvider`:

```prisma
enum SavedCardStatus {
  PENDING
  ACTIVE
  INACTIVE
  FAILED
}
```

Substituir o model `SavedCard` (linhas 170-182) por:

```prisma
model SavedCard {
  id              String          @id @default(uuid())
  userId          String          @map("user_id")
  tokenizationId  String          @unique @map("tokenization_id")
  status          SavedCardStatus @default(PENDING)
  email           String
  bin             String?
  cardBrand       String?         @map("card_brand")
  lastFour        String          @map("last_four")
  holderName      String          @map("holder_name")
  brandTid        String?         @map("brand_tid")
  lastSyncedAt    DateTime?       @map("last_synced_at")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt      @map("updated_at")

  user     User      @relation(fields: [userId], references: [id])
  payments Payment[]

  @@index([tokenizationId])
  @@map("saved_cards")
}
```

Nota: a relação `payments Payment[]` é o lado inverso da FK `Payment.savedCardId` adicionada na Task 2.

- [ ] **Step 2: Criar migration manual (não usar `prisma migrate dev` ainda)**

Crie diretório `prisma/migrations/20260430_savedcard_cofre_fields/` e arquivo `migration.sql`:

```sql
-- AlterTable: adiciona colunas novas em saved_cards
ALTER TABLE `saved_cards`
  ADD COLUMN `tokenization_id` VARCHAR(191) NULL,
  ADD COLUMN `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'FAILED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `bin` VARCHAR(191) NULL,
  ADD COLUMN `brand_tid` VARCHAR(191) NULL,
  ADD COLUMN `last_synced_at` DATETIME(3) NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Backfill: copia token -> tokenization_id (rename via copy)
UPDATE `saved_cards` SET `tokenization_id` = `token` WHERE `tokenization_id` IS NULL;

-- Backfill: email a partir do user vinculado
UPDATE `saved_cards` sc
  INNER JOIN `users` u ON sc.user_id = u.id
  SET sc.email = u.email
  WHERE sc.email IS NULL;

-- Defesa: se algum cartão não tem user (não deveria), preenche com placeholder pra não quebrar NOT NULL
UPDATE `saved_cards` SET `email` = 'unknown@placeholder.local' WHERE `email` IS NULL;

-- Aplica NOT NULL e unicidade depois do backfill
ALTER TABLE `saved_cards`
  MODIFY COLUMN `tokenization_id` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `email` VARCHAR(191) NOT NULL,
  ADD UNIQUE INDEX `saved_cards_tokenization_id_key` (`tokenization_id`),
  ADD INDEX `saved_cards_tokenizationId_idx` (`tokenization_id`);

-- DropIndex e DropColumn token (legado)
ALTER TABLE `saved_cards` DROP INDEX `saved_cards_token_key`;
ALTER TABLE `saved_cards` DROP COLUMN `token`;
```

- [ ] **Step 3: Aplicar migration**

Run: `npm run prisma:migrate dev -- --name savedcard_cofre_fields`

Aguardar prompt; aceitar criação. O Prisma vai detectar a migration manual e aplicar.

- [ ] **Step 4: Regenerar client**

Run: `npm run prisma:generate`

Expected: `✔ Generated Prisma Client (vX.Y.Z)` em `generated/prisma/`.

- [ ] **Step 5: Verificar suite ainda passa (com possíveis quebras de tipo, esperado)**

Run: `npm run test`

Expected: testes que dependem de `savedCard.token` (`SavedCardService.test.ts`, qualquer teste de `SavedCardRepository`) **vão quebrar**. Ignorar até serem ajustados nas Tasks 11-12. **Os outros 320+ testes devem continuar passando.**

Se algum teste **fora** dos contextos de SavedCard quebrar, parar e investigar.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260430_savedcard_cofre_fields/
git commit -m "feat(erede): migration SavedCard cofre fields (ALTER preserva dados)

Adiciona tokenization_id, status, email, bin, brand_tid, last_synced_at,
updated_at em saved_cards. Backfill: token -> tokenization_id; email
via JOIN com users. Status inicial PENDING força sync no primeiro uso
via assertActiveForCharge. Drop coluna token legada após validação."
```

---

## Task 2: Migration — `Payment` v2 fields

**Files:**
- Modify: `prisma/schema.prisma:112-143` — model `Payment`
- Create: `prisma/migrations/20260430_payment_v2_fields/migration.sql`

- [ ] **Step 1: Editar schema — adicionar campos novos no model `Payment`**

Adicionar antes do bloco `@@index([referenceNum])`:

```prisma
  brandTid           String?    @map("brand_tid")
  cardBin            String?    @map("card_bin")
  transactionLinkId  String?    @map("transaction_link_id")
  savedCardId        String?    @map("saved_card_id")

  savedCard          SavedCard? @relation(fields: [savedCardId], references: [id])
```

- [ ] **Step 2: Criar migration manual**

Crie `prisma/migrations/20260430_payment_v2_fields/migration.sql`:

```sql
ALTER TABLE `payments`
  ADD COLUMN `brand_tid` VARCHAR(191) NULL,
  ADD COLUMN `card_bin` VARCHAR(191) NULL,
  ADD COLUMN `transaction_link_id` VARCHAR(191) NULL,
  ADD COLUMN `saved_card_id` VARCHAR(191) NULL,
  ADD CONSTRAINT `payments_saved_card_id_fkey` FOREIGN KEY (`saved_card_id`) REFERENCES `saved_cards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `payments_saved_card_id_idx` ON `payments`(`saved_card_id`);
```

- [ ] **Step 3: Aplicar migration**

Run: `npm run prisma:migrate dev -- --name payment_v2_fields`

- [ ] **Step 4: Regenerar client**

Run: `npm run prisma:generate`

- [ ] **Step 5: Rodar suite**

Run: `npm run test`

Expected: mesmo estado da Task 1 (testes de SavedCard quebrados, resto passando).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260430_payment_v2_fields/
git commit -m "feat(erede): adiciona campos v2 em payments (brand_tid, card_bin, etc)

Campos retornados pela eRede v2 quando cobrança usa cardToken.
saved_card_id (FK opcional) liga pagamento ao cartão salvo.
Permite auditoria de chargebacks via brand_tid + transaction_link_id."
```

---

## Task 3: Migration — `EredeWebhookEvent` (CREATE TABLE)

**Files:**
- Modify: `prisma/schema.prisma` — adicionar enum + model
- Create: `prisma/migrations/20260430_erede_webhook_events/migration.sql`

- [ ] **Step 1: Editar schema — enum + model novos no fim do arquivo**

```prisma
enum EredeWebhookEventType {
  TOKENIZATION
  TRANSACTION
}

model EredeWebhookEvent {
  id              String                @id @default(uuid())
  externalId      String                @unique @map("external_id")
  eventType       EredeWebhookEventType @map("event_type")
  events          Json
  payload         Json
  processed       Boolean               @default(false)
  processedAt     DateTime?             @map("processed_at")
  errorMessage    String?               @map("error_message") @db.Text
  receivedAt      DateTime              @default(now()) @map("received_at")

  @@index([eventType, processed])
  @@map("erede_webhook_events")
}
```

- [ ] **Step 2: Criar migration manual**

Crie `prisma/migrations/20260430_erede_webhook_events/migration.sql`:

```sql
CREATE TABLE `erede_webhook_events` (
  `id` VARCHAR(191) NOT NULL,
  `external_id` VARCHAR(191) NOT NULL,
  `event_type` ENUM('TOKENIZATION', 'TRANSACTION') NOT NULL,
  `events` JSON NOT NULL,
  `payload` JSON NOT NULL,
  `processed` BOOLEAN NOT NULL DEFAULT false,
  `processed_at` DATETIME(3) NULL,
  `error_message` TEXT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `erede_webhook_events_external_id_key` (`external_id`),
  INDEX `erede_webhook_events_event_type_processed_idx` (`event_type`, `processed`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

- [ ] **Step 3: Aplicar migration**

Run: `npm run prisma:migrate dev -- --name erede_webhook_events`

- [ ] **Step 4: Regenerar client**

Run: `npm run prisma:generate`

- [ ] **Step 5: Rodar suite**

Run: `npm run test`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260430_erede_webhook_events/
git commit -m "feat(erede): tabela erede_webhook_events para idempotência e auditoria

externalId UNIQUE = idempotência por header Request-ID.
processed=false + errorMessage = ferramenta de diagnóstico.
A Rede retenta 12x/30s + 14d, então sem dedupe processamos N vezes."
```

---

## Task 4: `EredeOAuthClient` — service novo

**Files:**
- Create: `src/services/EredeOAuthClient.ts`
- Create: `src/__tests__/unit/services/EredeOAuthClient.test.ts`
- Modify: `src/config/erede.ts` — adicionar novas envs

**Contexto:** Cache em memória do access_token, renova ~60s antes de expirar, dedupe `inflight` evita N requests no boot. POST `/oauth2/token` com Basic auth do `clientId:clientSecret`. Erros 4xx/5xx mapeados conforme catálogo Seção 3.4 do spec.

- [ ] **Step 1: Atualizar `src/config/erede.ts`**

Substituir conteúdo por:

```ts
const eredeSandboxUrl = 'https://sandbox-erede.useredecloud.com.br/v2/transactions';
const eredeProductionUrl = 'https://api.userede.com.br/erede/v2/transactions';
const eredeOAuthSandboxUrl = 'https://rl7-sandbox-api.useredecloud.com.br/oauth2/token';
const eredeOAuthProductionUrl = 'https://rl7-api.useredecloud.com.br/oauth2/token';
const eredeTokenServiceSandboxUrl = 'https://rl7-sandbox-api.useredecloud.com.br/token-service/oauth/v2';
const eredeTokenServiceProductionUrl = 'https://rl7-api.useredecloud.com.br/token-service/oauth/v2';

const isProd = process.env.NODE_ENV === 'production';

export const eredeClientId = process.env.EREDE_CLIENT_ID || '';
export const eredeClientSecret = process.env.EREDE_CLIENT_SECRET || '';
export const eredeOAuthUrl = process.env.EREDE_OAUTH_URL || (isProd ? eredeOAuthProductionUrl : eredeOAuthSandboxUrl);
export const eredeTokenServiceUrl = process.env.EREDE_TOKEN_SERVICE_URL || (isProd ? eredeTokenServiceProductionUrl : eredeTokenServiceSandboxUrl);
export const eredeApiUrl = process.env.EREDE_API_URL || (isProd ? eredeProductionUrl : eredeSandboxUrl);
export const eredeTimeoutMs = parseInt(process.env.EREDE_TIMEOUT_MS || '', 10) || 15000;
export const eredeCallbackSecret = process.env.EREDE_CALLBACK_SECRET || '';
export const eredePixExpirationHours = parseInt(process.env.EREDE_PIX_EXPIRATION_HOURS || '', 10) || 24;
export const eredeSoftDescriptor = process.env.EREDE_SOFT_DESCRIPTOR || 'Tuppeware';
```

Nota: `eredePv` e `eredeIntegrationKey` removidos — eram usados só pelo Basic auth do `ERedeService` antigo (refator nas Tasks 8-9).

- [ ] **Step 2: Criar `src/__tests__/unit/services/EredeOAuthClient.test.ts` — testes RED**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

beforeEach(() => {
  process.env.EREDE_CLIENT_ID = 'test-client';
  process.env.EREDE_CLIENT_SECRET = 'test-secret';
  process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
  process.env.EREDE_TIMEOUT_MS = '15000';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const getClient = async () => {
  vi.resetModules();
  const mod = await import('../../../services/EredeOAuthClient');
  return mod.default;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('EredeOAuthClient.getAccessToken', () => {
  it('faz POST /oauth2/token com Basic auth e grant_type=client_credentials', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 1439 }));
    const client = await getClient();

    const token = await client.getAccessToken();

    expect(token).toBe('tok-1');
    const [url, init] = (fetch as Mock).mock.calls[0];
    expect(url).toBe('https://oauth.test/oauth2/token');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from(init.headers.Authorization.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('test-client:test-secret');
    expect(init.body).toContain('grant_type=client_credentials');
  });

  it('retorna token cacheado em chamadas subsequentes (dentro da janela)', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ access_token: 'tok-cached', expires_in: 1439 }));
    const client = await getClient();

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('tok-cached');
    expect(t2).toBe('tok-cached');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renova quando expires_at - 60s < now', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-old', expires_in: 30 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-new', expires_in: 1439 }));
    const client = await getClient();

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('tok-old');
    expect(t2).toBe('tok-new');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('dedupe: chamadas concorrentes resultam em 1 request', async () => {
    (fetch as Mock).mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ access_token: 'tok-once', expires_in: 1439 })), 10)),
    );
    const client = await getClient();

    const [t1, t2, t3] = await Promise.all([
      client.getAccessToken(),
      client.getAccessToken(),
      client.getAccessToken(),
    ]);

    expect(t1).toBe('tok-once');
    expect(t2).toBe('tok-once');
    expect(t3).toBe('tok-once');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('invalidate() força nova chamada na próxima request', async () => {
    (fetch as Mock)
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 1439 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-2', expires_in: 1439 }));
    const client = await getClient();

    const t1 = await client.getAccessToken();
    client.invalidate();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lança AppError 500 quando credenciais não configuradas', async () => {
    delete process.env.EREDE_CLIENT_ID;
    delete process.env.EREDE_CLIENT_SECRET;
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 500 });
  });

  it('lança AppError 500 quando OAuth retorna 401', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ error: 'invalid_client' }, 401));
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining('Credenciais'),
    });
  });

  it('lança AppError 503 quando OAuth retorna 5xx', async () => {
    (fetch as Mock).mockResolvedValueOnce(jsonResponse({ error: 'server_error' }, 503));
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 503 });
  });

  it('lança AppError 504 em timeout (AbortError)', async () => {
    (fetch as Mock).mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 503 em erro genérico de rede', async () => {
    (fetch as Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = await getClient();

    await expect(client.getAccessToken()).rejects.toMatchObject({ statusCode: 503 });
  });
});
```

- [ ] **Step 3: Rodar tests — confirmar que falham**

Run: `npx vitest run src/__tests__/unit/services/EredeOAuthClient.test.ts`

Expected: FAIL com `Cannot find module '../../../services/EredeOAuthClient'`.

- [ ] **Step 4: Criar `src/services/EredeOAuthClient.ts`**

```ts
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import {
  eredeClientId,
  eredeClientSecret,
  eredeOAuthUrl,
  eredeTimeoutMs,
} from '../config/erede';

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

class EredeOAuthClient {
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.cached && this.cached.expiresAt - 60_000 > now) {
      return this.cached.token;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this._fetchNewToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async _fetchNewToken(): Promise<string> {
    if (!eredeClientId || !eredeClientSecret) {
      throw new AppError(
        'Credenciais eRede OAuth não configuradas (EREDE_CLIENT_ID / EREDE_CLIENT_SECRET).',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    const credentials = Buffer.from(`${eredeClientId}:${eredeClientSecret}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), eredeTimeoutMs);

    try {
      const response = await fetch(eredeOAuthUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new AppError(
          'Credenciais eRede OAuth inválidas.',
          StatusCodes.INTERNAL_SERVER_ERROR,
        );
      }

      if (response.status >= 500) {
        throw new AppError(
          'Erro no gateway eRede ao autenticar.',
          StatusCodes.SERVICE_UNAVAILABLE,
        );
      }

      if (!response.ok) {
        throw new AppError(
          `Falha na autenticação eRede (HTTP ${response.status}).`,
          StatusCodes.INTERNAL_SERVER_ERROR,
        );
      }

      const json = (await response.json()) as { access_token: string; expires_in: number };

      this.cached = {
        token: json.access_token,
        expiresAt: Date.now() + json.expires_in * 1000,
      };

      return this.cached.token;
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'Timeout ao autenticar com a eRede.',
          StatusCodes.GATEWAY_TIMEOUT,
        );
      }

      throw new AppError(
        `Falha ao conectar com a eRede OAuth: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default new EredeOAuthClient();
```

- [ ] **Step 5: Rodar tests — confirmar que passam**

Run: `npx vitest run src/__tests__/unit/services/EredeOAuthClient.test.ts`

Expected: 9/9 passando.

- [ ] **Step 6: Rodar suite completa**

Run: `npm run test`

Expected: 344 + 9 = 353 testes (com SavedCard ainda quebrado das tasks 1-3) ou estado equivalente. Lint:

Run: `npm run lint`

Expected: 0 erros.

- [ ] **Step 7: Commit**

```bash
git add src/services/EredeOAuthClient.ts src/__tests__/unit/services/EredeOAuthClient.test.ts src/config/erede.ts
git commit -m "feat(erede): EredeOAuthClient com cache em memória e dedupe inflight

POST /oauth2/token com Basic(clientId:clientSecret) + grant_type=client_credentials.
Cache hit se expires_at - 60s > now. Dedupe via inflight Promise evita
N requests simultâneos no boot. invalidate() força nova chamada.
Timeout via AbortController. Erros mapeados conforme spec Seção 3.4."
```

---

## Task 5: `ERedeService.tokenizeCardCofre`

**Files:**
- Modify: `src/services/ERedeService.ts` — adicionar método novo (manter `tokenizeCard` legado por enquanto — será removido na Task 12)
- Modify: `src/__tests__/unit/services/ERedeService.test.ts` — adicionar testes

**Contexto:** Endpoint correto é `POST {EREDE_TOKEN_SERVICE_URL}/tokenization`. Headers: `Authorization: Bearer <token>` + `Affiliation: <eredeClientId>` (descoberta crítica do spec — não documentado oficialmente). Content-type guard mata o bug original (resposta não-JSON da Rede).

- [ ] **Step 1: Adicionar testes RED em `ERedeService.test.ts`**

Adicionar no fim do arquivo:

```ts
describe('ERedeService.tokenizeCardCofre', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_TOKEN_SERVICE_URL = 'https://api.test/token-service/oauth/v2';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const cardData = {
    email: 'user@test.com',
    cardNumber: '5448280000000007',
    expirationMonth: '12',
    expirationYear: '2030',
    cardholderName: 'TESTE',
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('chama POST /tokenization com Bearer + Affiliation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok-bearer', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'tok-uuid-123' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.tokenizeCardCofre(cardData);

    expect(result.tokenizationId).toBe('tok-uuid-123');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.test/token-service/oauth/v2/tokenization');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-bearer');
    expect(init.headers.Affiliation).toBe('test-client');
  });

  it('lança AppError 502 quando Rede retorna content-type não-JSON', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(new Response('<?xml version="1.0"?><error/>', {
        status: 403,
        headers: { 'content-type': 'application/xml' },
      })));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('não-JSON') });
  });

  it('retry em 401: invalida token e tenta 1x mais', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok-old', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(json({ access_token: 'tok-new', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'after-retry' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.tokenizeCardCofre(cardData);

    expect(result.tokenizationId).toBe('after-retry');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('lança AppError com returnMessage da Rede quando 4xx com payload', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'Cartão inválido', returnCode: '99' }, 400)));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ message: expect.stringContaining('Cartão inválido') });
  });

  it('lança AppError 502 quando 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ error: 'server' }, 503)));

    const svc = await getService();
    await expect(svc.tokenizeCardCofre(cardData))
      .rejects.toMatchObject({ statusCode: 502 });
  });

  it('inclui securityCode no body quando fornecido', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'id' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    await svc.tokenizeCardCofre({ ...cardData, securityCode: '123' });

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.securityCode).toBe('123');
  });
});
```

- [ ] **Step 2: Rodar — confirmar RED**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t tokenizeCardCofre`

Expected: 6 testes falhando com `tokenizeCardCofre is not a function`.

- [ ] **Step 3: Implementar em `src/services/ERedeService.ts`**

Adicionar imports no topo (substituir os existentes que mudam):

```ts
import {
  eredeApiUrl,
  eredeCallbackSecret,
  eredeClientId,
  eredeOAuthUrl,
  eredeTokenServiceUrl,
  eredePixExpirationHours,
  eredeSoftDescriptor,
  eredeTimeoutMs,
} from '../config/erede';
import oauthClient from './EredeOAuthClient';
```

Remover imports `eredePv` e `eredeIntegrationKey` (eles ainda existem no Basic auth do `tokenizeCard`/`createTransaction` antigos? Sim — mas serão removidos junto, mantendo só durante refator).

**Adicionar dentro da classe `ERedeService`** (não remover métodos existentes ainda):

```ts
  /**
   * Tokeniza um cartão via Cofre eRede (OAuth + Affiliation).
   * Endpoint: POST {EREDE_TOKEN_SERVICE_URL}/tokenization.
   */
  async tokenizeCardCofre(params: {
    email: string;
    cardNumber: string;
    expirationMonth: string;
    expirationYear: string;
    cardholderName: string;
    securityCode?: string;
  }): Promise<{ tokenizationId: string }> {
    const url = `${eredeTokenServiceUrl}/tokenization`;
    const body: Record<string, string> = {
      email: params.email,
      cardNumber: params.cardNumber,
      expirationMonth: params.expirationMonth,
      expirationYear: params.expirationYear,
      cardholderName: params.cardholderName,
    };
    if (params.securityCode) body.securityCode = params.securityCode;

    const json = await this._authedFetchJson(url, { method: 'POST', body: JSON.stringify(body) });

    return { tokenizationId: String(json.tokenizationId ?? '') };
  }

  /**
   * Helper privado: faz fetch autenticado com retry em 401, content-type guard
   * e tradução de erros pra AppError.
   */
  private async _authedFetchJson(
    url: string,
    init: RequestInit,
    isRetry = false,
  ): Promise<Record<string, unknown>> {
    if (!eredeClientId) {
      throw new AppError(
        'Configuração inválida: EREDE_CLIENT_ID ausente (Affiliation header).',
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), eredeTimeoutMs);

    try {
      const accessToken = await oauthClient.getAccessToken();
      const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${accessToken}`,
        Affiliation: eredeClientId,
        Accept: 'application/json',
      };
      if (init.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, { ...init, headers, signal: controller.signal });

      if (response.status === 401 && !isRetry) {
        oauthClient.invalidate();
        return await this._authedFetchJson(url, init, true);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new AppError(
          `eRede retornou resposta não-JSON (status ${response.status}, content-type ${contentType}): ${text.slice(0, 200)}`,
          StatusCodes.BAD_GATEWAY,
        );
      }

      const json = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        if (response.status >= 500) {
          throw new AppError(
            (json.returnMessage as string) || 'Erro no gateway eRede',
            StatusCodes.BAD_GATEWAY,
          );
        }
        throw new AppError(
          (json.returnMessage as string) || `eRede retornou HTTP ${response.status}`,
          StatusCodes.BAD_REQUEST,
        );
      }

      return json;
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'Timeout ao conectar com a eRede.',
          StatusCodes.GATEWAY_TIMEOUT,
        );
      }

      throw new AppError(
        `Falha ao conectar com a eRede: ${(error as Error).message}`,
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
```

- [ ] **Step 4: Rodar tests novos — confirmar passam**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t tokenizeCardCofre`

Expected: 6/6 passando.

- [ ] **Step 5: Rodar suite — confirmar nenhum teste antigo quebrou**

Run: `npm run test`

Expected: testes antigos do `ERedeService` (Basic auth) **continuam passando** (não tocamos `tokenizeCard` antigo nem `createTransaction`). Lint:

Run: `npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/services/ERedeService.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "feat(erede): tokenizeCardCofre via OAuth + Affiliation header

POST {EREDE_TOKEN_SERVICE_URL}/tokenization com Bearer token e header
Affiliation (descoberta não documentada). Helper privado _authedFetchJson
centraliza retry em 401, content-type guard (mata bug do response.json()
em XML) e tradução de erros pra AppError. tokenizeCard legado mantido
temporariamente — removido na Task 12."
```

---

## Task 6: `ERedeService.queryTokenization`

**Files:**
- Modify: `src/services/ERedeService.ts` — adicionar método
- Modify: `src/__tests__/unit/services/ERedeService.test.ts` — testes

- [ ] **Step 1: Testes RED**

Adicionar no fim de `ERedeService.test.ts`:

```ts
describe('ERedeService.queryTokenization', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_TOKEN_SERVICE_URL = 'https://api.test/token-service/oauth/v2';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('faz GET /tokenization/{id} e mapeia status', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tokenizationId: 'tok-uuid',
        tokenizationStatus: 'Active',
        bin: '544828',
        last4digits: '0007',
        brand: 'MASTERCARD',
        brandTid: 'btid-1',
        lastModifiedDate: '2026-04-30T12:00:00Z',
      })));

    const svc = await getService();
    const result = await svc.queryTokenization('tok-uuid');

    expect(result.tokenizationId).toBe('tok-uuid');
    expect(result.status).toBe('ACTIVE');
    expect(result.bin).toBe('544828');
    expect(result.last4).toBe('0007');
    expect(result.brand).toBe('MASTERCARD');
    expect(result.brandTid).toBe('btid-1');
  });

  it('mapeia "Suspended" para INACTIVE', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'x', tokenizationStatus: 'Suspended' })));

    const svc = await getService();
    const result = await svc.queryTokenization('x');

    expect(result.status).toBe('INACTIVE');
  });

  it('mapeia "Pending" para PENDING', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'x', tokenizationStatus: 'Pending' })));

    const svc = await getService();
    const result = await svc.queryTokenization('x');

    expect(result.status).toBe('PENDING');
  });

  it('mapeia "Failed" para FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ tokenizationId: 'x', tokenizationStatus: 'Failed' })));

    const svc = await getService();
    const result = await svc.queryTokenization('x');

    expect(result.status).toBe('FAILED');
  });

  it('lança AppError quando 404', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'Tokenization not found' }, 404)));

    const svc = await getService();
    await expect(svc.queryTokenization('nope'))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
```

- [ ] **Step 2: Rodar — RED**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t queryTokenization`

Expected: 5 falhas (`queryTokenization is not a function`).

- [ ] **Step 3: Implementar em `ERedeService.ts`**

Adicionar dentro da classe:

```ts
  /**
   * Consulta o estado de uma tokenização no Cofre.
   */
  async queryTokenization(tokenizationId: string): Promise<{
    tokenizationId: string;
    status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'FAILED';
    bin?: string;
    last4?: string;
    brand?: string;
    brandTid?: string;
    lastModifiedDate?: string;
    raw: Record<string, unknown>;
  }> {
    const url = `${eredeTokenServiceUrl}/tokenization/${encodeURIComponent(tokenizationId)}`;
    const json = await this._authedFetchJson(url, { method: 'GET' });

    return {
      tokenizationId: String(json.tokenizationId ?? tokenizationId),
      status: this._mapTokenizationStatus(String(json.tokenizationStatus ?? '')),
      bin: json.bin ? String(json.bin) : undefined,
      last4: json.last4digits ? String(json.last4digits) : undefined,
      brand: json.brand ? String(json.brand) : undefined,
      brandTid: json.brandTid ? String(json.brandTid) : undefined,
      lastModifiedDate: json.lastModifiedDate ? String(json.lastModifiedDate) : undefined,
      raw: json,
    };
  }

  private _mapTokenizationStatus(remote: string): 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'FAILED' {
    const normalized = remote.toLowerCase();
    if (normalized === 'active') return 'ACTIVE';
    if (normalized === 'pending') return 'PENDING';
    if (normalized === 'inactive' || normalized === 'suspended') return 'INACTIVE';
    if (normalized === 'failed') return 'FAILED';
    return 'PENDING';
  }
```

- [ ] **Step 4: Rodar tests — passa**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t queryTokenization`

Expected: 5/5.

- [ ] **Step 5: Suite + lint**

Run: `npm run test && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/services/ERedeService.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "feat(erede): queryTokenization e _mapTokenizationStatus

GET /tokenization/{id} retorna status, bin, last4, brand, brandTid.
Mapeamento: Active→ACTIVE, Pending→PENDING, Inactive/Suspended→INACTIVE,
Failed→FAILED. Suspended vira INACTIVE pra simplificar UX (decidido na
Seção 3.2 do spec)."
```

---

## Task 7: `ERedeService.manageTokenization`

**Files:**
- Modify: `src/services/ERedeService.ts`
- Modify: `src/__tests__/unit/services/ERedeService.test.ts`

- [ ] **Step 1: Testes RED**

Adicionar:

```ts
describe('ERedeService.manageTokenization', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_TOKEN_SERVICE_URL = 'https://api.test/token-service/oauth/v2';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('faz POST /tokenization/{id}/management com action=delete', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnCode: '00', returnMessage: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.manageTokenization('tok-id', 'delete', 1);

    expect(result.returnCode).toBe('00');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('/tokenization/tok-id/management');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.action).toBe('delete');
    expect(body.reason).toBe(1);
  });

  it('omite reason quando não fornecido', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnCode: '00', returnMessage: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    await svc.manageTokenization('tok-id', 'delete');

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.reason).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t manageTokenization`

- [ ] **Step 3: Implementar**

Adicionar na classe:

```ts
  /**
   * Aciona uma operação de management no Cofre (atualmente: delete).
   */
  async manageTokenization(
    tokenizationId: string,
    action: 'delete',
    reason?: number,
  ): Promise<{ returnCode: string; returnMessage: string }> {
    const url = `${eredeTokenServiceUrl}/tokenization/${encodeURIComponent(tokenizationId)}/management`;
    const body: Record<string, unknown> = { action };
    if (reason !== undefined) body.reason = reason;

    const json = await this._authedFetchJson(url, { method: 'POST', body: JSON.stringify(body) });

    return {
      returnCode: String(json.returnCode ?? ''),
      returnMessage: String(json.returnMessage ?? ''),
    };
  }
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t manageTokenization`

Expected: 2/2.

- [ ] **Step 5: Suite + lint**

Run: `npm run test && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/services/ERedeService.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "feat(erede): manageTokenization para delete de cartões salvos

POST /tokenization/{id}/management com action e reason opcionais.
Usado pelo SavedCardService.deleteCard (best-effort) na Task 13."
```

---

## Task 8: Refator `ERedeService.createTransaction` (v2 + Bearer)

**Files:**
- Modify: `src/services/ERedeService.ts` — substituir `createTransaction` atual
- Modify: `src/__tests__/unit/services/ERedeService.test.ts` — ajustar testes existentes
- Modify: `src/types/index.ts` — adicionar campos novos no `ERedeTransactionResponse`

**Contexto:** Hosts mudam: `https://sandbox-erede.useredecloud.com.br/v2/transactions` (sandbox), `https://api.userede.com.br/erede/v2/transactions` (prod). `EREDE_API_URL` no `.env.example` e `config/erede.ts` já apontam pra v2 desde Task 4. Auth muda de Basic → Bearer + Affiliation. Response v2 inclui `cardBin`, `brandTid`, `transactionLinkId`.

- [ ] **Step 1: Atualizar `src/types/index.ts`**

Modificar `ERedeTransactionResponse` (linhas 139-149):

```ts
export interface ERedeTransactionResponse {
  tid: string;
  returnCode: string;
  returnMessage: string;
  reference: string;
  nsu?: string;
  authorizationCode?: string;
  dateTime?: string;
  cardBin?: string;
  brandTid?: string;
  transactionLinkId?: string;
  pix?: ERedePixData;
  raw: Record<string, unknown>;
}
```

- [ ] **Step 2: Ajustar testes existentes em `ERedeService.test.ts`**

Substituir os testes do bloco `describe('ERedeService.createTransaction')` (linhas 342-388 originais). **Os testes antigos vão ser modificados — manter os cenários (success, gateway error, timeout) mas com o novo modelo de auth**.

Localizar `describe('ERedeService.createTransaction', () => {` e substituir blocos por:

```ts
describe('ERedeService.createTransaction', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_API_URL = 'https://api.test/v2/transactions';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('retorna resposta parseada em caso de sucesso PIX (Bearer + Affiliation)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tid: 'tid-123', returnCode: '00', returnMessage: 'Aprovado', reference: 'TPW-1',
        pix: { qrCode: '00020126...', link: 'https://pix.link/qr', expirationDate: '2026-04-02T10:00:00Z' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = await getService();
    const result = await svc.createTransaction(svc.buildPixPayload('TPW-1', 15000));

    expect(result.returnCode).toBe('00');
    expect(result.pix?.qrCode).toBe('00020126...');
    const init = fetchMock.mock.calls[1][1];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.Affiliation).toBe('test-client');
  });

  it('extrai cardBin, brandTid, transactionLinkId quando presentes (cobrança v2)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tid: 'tid-123', returnCode: '00', returnMessage: 'OK', reference: 'TPW-1',
        cardBin: '544828', brandTid: 'btid-99', transactionLinkId: 'link-abc',
      })));

    const svc = await getService();
    const result = await svc.createTransaction(svc.buildPixPayload('TPW-1', 1000));

    expect(result.cardBin).toBe('544828');
    expect(result.brandTid).toBe('btid-99');
    expect(result.transactionLinkId).toBe('link-abc');
  });

  it('lança AppError quando gateway retorna 4xx com returnMessage', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'Cartão inválido' }, 400)));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ message: expect.stringContaining('Cartão inválido') });
  });

  it('lança AppError 504 em timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    }));

    const svc = await getService();
    await expect(svc.createTransaction(svc.buildPixPayload('TPW-1', 1000)))
      .rejects.toMatchObject({ statusCode: 504 });
  });

  it('lança AppError 500 quando EREDE_CLIENT_ID ausente', async () => {
    delete process.env.EREDE_CLIENT_ID;
    vi.resetModules();
    const mod = await import('../../../services/ERedeService');
    await expect(mod.default.createTransaction({ kind: 'pix', reference: 'TPW-1', amount: 1000, expirationDate: '' }))
      .rejects.toMatchObject({ statusCode: 500 });
  });
});
```

E substituir/remover o bloco `describe('ERedeService.createTransaction — erro genérico de rede')` se ainda existir, pois o caso já foi coberto pelo `_authedFetchJson`. Remover também o `describe` de `validateConfig` que dependia de `EREDE_PV` — não existe mais (validar via `EREDE_CLIENT_ID` agora coberto no test "lança AppError 500 quando EREDE_CLIENT_ID ausente").

- [ ] **Step 3: RED — testes ajustados quebram porque createTransaction ainda usa Basic auth**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t createTransaction`

Expected: testes novos falham por response/headers inesperados.

- [ ] **Step 4: Substituir o `createTransaction` em `src/services/ERedeService.ts`**

Localizar o método `async createTransaction(payload: ERedeTransactionRequest)` e substituir corpo inteiro por:

```ts
  async createTransaction(payload: ERedeTransactionRequest): Promise<ERedeTransactionResponse> {
    const json = await this._authedFetchJson(eredeApiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return this.parseResponse(json);
  }
```

E ajustar `parseResponse` (privado) pra extrair os novos campos:

```ts
  private parseResponse(json: Record<string, unknown>): ERedeTransactionResponse {
    const pixData = json.pix as Record<string, unknown> | undefined;

    return {
      tid: String(json.tid ?? ''),
      returnCode: String(json.returnCode ?? ''),
      returnMessage: String(json.returnMessage ?? ''),
      reference: String(json.reference ?? ''),
      nsu: json.nsu ? String(json.nsu) : undefined,
      authorizationCode: json.authorizationCode ? String(json.authorizationCode) : undefined,
      dateTime: json.dateTime ? String(json.dateTime) : undefined,
      cardBin: json.cardBin ? String(json.cardBin) : undefined,
      brandTid: json.brandTid ? String(json.brandTid) : undefined,
      transactionLinkId: json.transactionLinkId ? String(json.transactionLinkId) : undefined,
      pix: pixData
        ? {
            qrCode: String(pixData.qrCode ?? ''),
            link: String(pixData.link ?? ''),
            expirationDate: String(pixData.expirationDate ?? ''),
          }
        : undefined,
      raw: json,
    };
  }
```

- [ ] **Step 5: GREEN**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t createTransaction`

Expected: 5/5 passando.

- [ ] **Step 6: Suite + lint**

Run: `npm run test && npm run lint`

Esperado: alguns testes do `PaymentService.test.ts` ainda podem usar mocks Basic — deixar quebrando, será ajustado na Task 15.

Se passarem todos exceto SavedCard (Tasks 1-3) e PaymentService (Task 15), seguir.

- [ ] **Step 7: Commit**

```bash
git add src/services/ERedeService.ts src/types/index.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "refactor(erede): createTransaction migrada para v2 + Bearer + Affiliation

Helper privado _authedFetchJson centraliza auth. parseResponse passa a
extrair cardBin, brandTid, transactionLinkId (devolvidos pela API v2 em
cobranças com cardToken). Type ERedeTransactionResponse ganha 3 campos
opcionais. Testes existentes ajustados para Bearer + Affiliation."
```

---

## Task 9: Refator `ERedeService.queryTransaction`

**Files:**
- Modify: `src/services/ERedeService.ts`
- Modify: `src/__tests__/unit/services/ERedeService.test.ts`

- [ ] **Step 1: Ajustar testes existentes de `queryTransaction`**

Localizar `describe('ERedeService.queryTransaction', () => {` e substituir por:

```ts
describe('ERedeService.queryTransaction', () => {
  beforeEach(() => {
    process.env.EREDE_CLIENT_ID = 'test-client';
    process.env.EREDE_CLIENT_SECRET = 'test-secret';
    process.env.EREDE_OAUTH_URL = 'https://oauth.test/oauth2/token';
    process.env.EREDE_API_URL = 'https://api.test/v2/transactions';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('retorna dados da transação quando consulta bem-sucedida', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({
        tid: 'tid-123', returnCode: '00', returnMessage: 'OK',
        status: 0, amount: 15000, reference: 'TPW-ref-1',
      })));

    const svc = await getService();
    const result = await svc.queryTransaction('tid-123');

    expect(result.tid).toBe('tid-123');
    expect(result.returnCode).toBe('00');
    expect(result.amount).toBe(15000);
  });

  it('lança AppError quando consulta retorna 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok', expires_in: 1439 }))
      .mockResolvedValueOnce(json({ returnMessage: 'TID não encontrado' }, 404)));

    const svc = await getService();
    await expect(svc.queryTransaction('tid-invalido'))
      .rejects.toMatchObject({ message: expect.stringContaining('TID não encontrado') });
  });

  it('lança AppError 504 em timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    }));

    const svc = await getService();
    await expect(svc.queryTransaction('tid-timeout'))
      .rejects.toMatchObject({ statusCode: 504 });
  });
});
```

Remover o bloco `describe('ERedeService.queryTransaction — timeout e erro genérico')` se duplicar.

- [ ] **Step 2: RED**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t queryTransaction`

- [ ] **Step 3: Substituir `queryTransaction` em `ERedeService.ts`**

Localizar e substituir o método `async queryTransaction(tid: string)` por:

```ts
  async queryTransaction(tid: string): Promise<ERedeQueryResponse> {
    const url = `${eredeApiUrl}/${encodeURIComponent(tid)}`;
    const json = await this._authedFetchJson(url, { method: 'GET' });

    return {
      tid: String(json.tid ?? ''),
      returnCode: String(json.returnCode ?? ''),
      returnMessage: String(json.returnMessage ?? ''),
      status: Number(json.status ?? -1),
      amount: Number(json.amount ?? 0),
      reference: String(json.reference ?? ''),
      raw: json,
    };
  }
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t queryTransaction`

- [ ] **Step 5: Suite + lint**

Run: `npm run test && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/services/ERedeService.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "refactor(erede): queryTransaction usa _authedFetchJson (Bearer + Affiliation)

Mesma lógica do createTransaction — auth, content-type guard, retry 401
centralizados no helper. Testes ajustados pro novo modelo de mocks."
```

---

## Task 10: `ERedeService.buildCreditPayload` — omitir campos quando `cardToken`

**Files:**
- Modify: `src/services/ERedeService.ts`
- Modify: `src/__tests__/unit/services/ERedeService.test.ts`

**Contexto:** O teste `'usa cardToken em vez de cardNumber quando token fornecido'` (linhas 312-340 do test atual) já existe e passa, mas o spec exige **omitir cardHolderName, expirationMonth, expirationYear quando há cardToken** (pra evitar conflito com os dados associados ao token no Cofre). O comportamento atual só omite `cardNumber`.

- [ ] **Step 1: Adicionar teste RED**

Adicionar no fim do arquivo:

```ts
describe('ERedeService.buildCreditPayload — Cofre completo', () => {
  it('omite cardNumber, cardHolderName, expirationMonth e expirationYear quando cardToken presente', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-cofre',
      amountCents: 10000,
      installments: 1,
      card: { number: 'IGNORE', expMonth: 'IGNORE', expYear: 'IGNORE', cvv: '123', holderName: 'IGNORE' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
      cardToken: 'tok-cofre-123',
    }) as any;

    expect(payload.cardToken).toBe('tok-cofre-123');
    expect(payload.cardNumber).toBeUndefined();
    expect(payload.cardHolderName).toBeUndefined();
    expect(payload.expirationMonth).toBeUndefined();
    expect(payload.expirationYear).toBeUndefined();
    expect(payload.securityCode).toBe('123'); // CVV mantido
  });

  it('mantém cardNumber, cardHolderName, expirationMonth e expirationYear quando sem cardToken', async () => {
    const svc = await getService();
    const payload = svc.buildCreditPayload({
      reference: 'TPW-direto',
      amountCents: 10000,
      installments: 1,
      card: { number: '4111111111111111', expMonth: '12', expYear: '2028', cvv: '123', holderName: 'TESTE' },
      billing: { name: 'T', document: '111', email: 't@t.com', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    }) as any;

    expect(payload.cardNumber).toBe('4111111111111111');
    expect(payload.cardHolderName).toBe('TESTE');
    expect(payload.expirationMonth).toBe('12');
    expect(payload.expirationYear).toBe('2028');
    expect(payload.cardToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t "buildCreditPayload — Cofre completo"`

Expected: 1ª falha — atualmente `expirationMonth` e `cardHolderName` ainda vem preenchidos quando `cardToken` está presente.

- [ ] **Step 3: Modificar `buildCreditPayload` em `ERedeService.ts`**

Substituir o método pelo novo:

```ts
  buildCreditPayload(params: {
    reference: string;
    amountCents: number;
    installments: number;
    card: {
      number: string;
      expMonth: string;
      expYear: string;
      cvv: string;
      holderName: string;
    };
    billing: {
      name: string;
      document: string;
      email: string;
      address: string;
      address2?: string;
      district: string;
      city: string;
      state: string;
      postalcode: string;
      country?: string;
    };
    cardToken?: string;
  }): ERedeCreditRequest {
    const base: ERedeCreditRequest = {
      kind: 'credit',
      reference: params.reference,
      amount: params.amountCents,
      installments: params.installments,
      cardHolderName: params.card.holderName,
      cardNumber: params.card.number,
      expirationMonth: params.card.expMonth,
      expirationYear: params.card.expYear,
      securityCode: params.card.cvv,
      capture: true,
      softDescriptor: eredeSoftDescriptor,
      billing: {
        name: params.billing.name,
        document: params.billing.document.replace(/\D/g, ''),
        email: params.billing.email,
        address: {
          street: params.billing.address,
          number: 'S/N',
          complement: params.billing.address2 || '',
          district: params.billing.district,
          city: params.billing.city,
          state: params.billing.state,
          zipCode: params.billing.postalcode,
          country: this.normalizeCountry(params.billing.country || 'BR'),
        },
      },
    };

    if (params.cardToken) {
      const { cardNumber: _cn, cardHolderName: _ch, expirationMonth: _em, expirationYear: _ey, ...rest } = base;
      return { ...rest, cardToken: params.cardToken } as ERedeCreditRequest;
    }

    return base;
  }
```

Nota: `ERedeCreditRequest` em `types/index.ts` já tem `cardNumber?` e `cardToken?` opcionais (linhas 121-122) — mas `cardHolderName`, `expirationMonth`, `expirationYear` estão obrigatórios. Tornar opcionais:

Editar `src/types/index.ts` linha 115-129:

```ts
export interface ERedeCreditRequest {
  kind: 'credit';
  reference: string;
  amount: number;
  installments: number;
  cardHolderName?: string;
  cardNumber?: string;
  cardToken?: string;
  expirationMonth?: string;
  expirationYear?: string;
  securityCode: string;
  capture: true;
  softDescriptor: string;
  billing: ERedeBilling;
}
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run src/__tests__/unit/services/ERedeService.test.ts -t buildCreditPayload`

Expected: todos passando (incluindo os existentes e os novos).

- [ ] **Step 5: Suite + lint**

Run: `npm run test && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/services/ERedeService.ts src/types/index.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "refactor(erede): buildCreditPayload omite dados do cartão quando cardToken

Quando cardToken presente, payload v2 NÃO deve incluir cardNumber,
cardHolderName, expirationMonth, expirationYear (esses dados estão
associados ao token no Cofre). Mantém apenas securityCode (CVV exigido
em cada cobrança). ERedeCreditRequest tem campos do cartão opcionais."
```

---

## Task 11: `SavedCardRepository` — métodos novos

**Files:**
- Modify: `src/repositories/SavedCardRepository.ts`
- Create: `src/__tests__/unit/repositories/SavedCardRepository.test.ts`

**Contexto:** Testes existentes do `SavedCardService` ainda quebrados das tasks 1-3 — vão ser ajustados na Task 12. Aqui criamos os métodos que ele vai usar.

- [ ] **Step 1: Criar `src/__tests__/unit/repositories/SavedCardRepository.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    savedCard: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import savedCardRepository from '../../../repositories/SavedCardRepository';
import prisma from '../../../config/database';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavedCardRepository.findByTokenizationId', () => {
  it('busca via where.tokenizationId', async () => {
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValueOnce({ id: 'c1' } as any);

    const result = await savedCardRepository.findByTokenizationId('tok-uuid');

    expect(prisma.savedCard.findUnique).toHaveBeenCalledWith({ where: { tokenizationId: 'tok-uuid' } });
    expect(result?.id).toBe('c1');
  });

  it('retorna null quando não encontra', async () => {
    vi.mocked(prisma.savedCard.findUnique).mockResolvedValueOnce(null);

    const result = await savedCardRepository.findByTokenizationId('nope');

    expect(result).toBeNull();
  });
});

describe('SavedCardRepository.updateStatus', () => {
  it('atualiza status e campos do GET de tokenization', async () => {
    vi.mocked(prisma.savedCard.update).mockResolvedValueOnce({ id: 'c1', status: 'ACTIVE' } as any);

    const result = await savedCardRepository.updateStatus('c1', {
      status: 'ACTIVE',
      bin: '544828',
      cardBrand: 'MASTERCARD',
      lastFour: '0007',
      brandTid: 'btid-1',
      lastSyncedAt: new Date('2026-04-30T12:00:00Z'),
    });

    expect(prisma.savedCard.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'ACTIVE', bin: '544828' }),
    });
    expect(result.status).toBe('ACTIVE');
  });

  it('aceita atualização parcial (só status)', async () => {
    vi.mocked(prisma.savedCard.update).mockResolvedValueOnce({ id: 'c1', status: 'INACTIVE' } as any);

    await savedCardRepository.updateStatus('c1', { status: 'INACTIVE' });

    const callArg = vi.mocked(prisma.savedCard.update).mock.calls[0][0];
    expect(callArg.data.status).toBe('INACTIVE');
    expect(callArg.data.bin).toBeUndefined();
  });
});

describe('SavedCardRepository.findActiveForUser', () => {
  it('filtra por userId e id (sem importar o status — service decide)', async () => {
    vi.mocked(prisma.savedCard.findFirst).mockResolvedValueOnce({ id: 'c1' } as any);

    const result = await savedCardRepository.findActiveForUser('u1', 'c1');

    expect(prisma.savedCard.findFirst).toHaveBeenCalledWith({
      where: { id: 'c1', userId: 'u1' },
    });
    expect(result?.id).toBe('c1');
  });

  it('retorna null quando cartão não pertence ao user', async () => {
    vi.mocked(prisma.savedCard.findFirst).mockResolvedValueOnce(null);

    const result = await savedCardRepository.findActiveForUser('u1', 'c1');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/__tests__/unit/repositories/SavedCardRepository.test.ts`

Expected: falha por método não existir.

- [ ] **Step 3: Substituir `src/repositories/SavedCardRepository.ts`**

```ts
import prisma from '../config/database';
import type { SavedCard, Prisma, SavedCardStatus } from '../../generated/prisma/client';

interface UpdateStatusInput {
  status: SavedCardStatus;
  bin?: string | null;
  cardBrand?: string | null;
  lastFour?: string;
  brandTid?: string | null;
  lastSyncedAt?: Date;
}

class SavedCardRepository {
  async create(data: Prisma.SavedCardUncheckedCreateInput): Promise<SavedCard> {
    return await prisma.savedCard.create({ data });
  }

  async findByUserId(userId: string): Promise<SavedCard[]> {
    return await prisma.savedCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findUnique({ where: { id } });
  }

  async findByTokenizationId(tokenizationId: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findUnique({ where: { tokenizationId } });
  }

  async findActiveForUser(userId: string, savedCardId: string): Promise<SavedCard | null> {
    return await prisma.savedCard.findFirst({ where: { id: savedCardId, userId } });
  }

  async updateStatus(id: string, data: UpdateStatusInput): Promise<SavedCard> {
    return await prisma.savedCard.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<SavedCard> {
    return await prisma.savedCard.delete({ where: { id } });
  }
}

export default new SavedCardRepository();
```

Nota: removido `findByToken` antigo (não existe mais coluna `token`).

Adicionar `SavedCardStatus` no re-export de tipos em `src/types/index.ts`:

Localizar bloco `export {` (linhas 13-18) e adicionar:

```ts
export {
  UserRole,
  DebtStatus,
  PaymentMethod,
  PaymentStatus,
  SavedCardStatus,
} from '../../generated/prisma/client';
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run src/__tests__/unit/repositories/SavedCardRepository.test.ts`

Expected: 6/6 passando.

- [ ] **Step 5: Suite + lint**

Run: `npm run test && npm run lint`

Esperado: SavedCardService.test.ts continua quebrando (Task 12 ajusta), PaymentService.test.ts pode continuar quebrando (Task 15 ajusta). Outros testes devem passar.

- [ ] **Step 6: Commit**

```bash
git add src/repositories/SavedCardRepository.ts src/types/index.ts src/__tests__/unit/repositories/SavedCardRepository.test.ts
git commit -m "feat(erede): SavedCardRepository com métodos do Cofre

findByTokenizationId, findActiveForUser, updateStatus. Remove
findByToken (coluna token foi DROP na Task 1). SavedCardStatus
re-exportado em types/index.ts."
```

---

## Task 12: Refator `SavedCardService.tokenizeAndSave` + DTO `SavedCardPublicView`

**Files:**
- Modify: `src/services/SavedCardService.ts`
- Modify: `src/__tests__/unit/services/SavedCardService.test.ts`
- Modify: `src/services/ERedeService.ts` — remover método `tokenizeCard` legado
- Modify: `src/__tests__/unit/services/ERedeService.test.ts` — remover tests do `tokenizeCard` legado

**Contexto:** `tokenizeCard` antigo (origem do bug 503) sai de cena. `SavedCardService.tokenizeAndSave` recebe `email`, faz sync imediato best-effort, retorna DTO público (nunca expõe `tokenizationId`).

- [ ] **Step 1: Substituir `src/__tests__/unit/services/SavedCardService.test.ts`**

Ler o arquivo antes:

Run: `cat src/__tests__/unit/services/SavedCardService.test.ts | head -100`

Substituir conteúdo inteiro por:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCodes } from 'http-status-codes';

vi.mock('../../../repositories/SavedCardRepository', () => ({
  default: {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByTokenizationId: vi.fn(),
    findActiveForUser: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../services/ERedeService', () => ({
  default: {
    tokenizeCardCofre: vi.fn(),
    queryTokenization: vi.fn(),
    manageTokenization: vi.fn(),
  },
}));

import savedCardService from '../../../services/SavedCardService';
import savedCardRepository from '../../../repositories/SavedCardRepository';
import eRedeService from '../../../services/ERedeService';

const makeCard = (overrides: Record<string, unknown> = {}) => ({
  id: 'card-1',
  userId: 'user-1',
  tokenizationId: 'tok-uuid',
  status: 'PENDING' as const,
  email: 'user@test.com',
  bin: null,
  cardBrand: null,
  lastFour: '0007',
  holderName: 'TESTE',
  brandTid: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavedCardService.tokenizeAndSave', () => {
  it('tokeniza, persiste com PENDING e faz sync imediato (best-effort)', async () => {
    vi.mocked(eRedeService.tokenizeCardCofre).mockResolvedValueOnce({ tokenizationId: 'tok-uuid' });
    vi.mocked(savedCardRepository.create).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.queryTokenization).mockResolvedValueOnce({
      tokenizationId: 'tok-uuid',
      status: 'ACTIVE',
      bin: '544828',
      last4: '0007',
      brand: 'MASTERCARD',
      brandTid: 'btid-1',
      raw: {},
    });
    vi.mocked(savedCardRepository.updateStatus).mockResolvedValueOnce(
      makeCard({ status: 'ACTIVE', bin: '544828', cardBrand: 'MASTERCARD' }) as any,
    );

    const result = await savedCardService.tokenizeAndSave({
      userId: 'user-1',
      email: 'user@test.com',
      cardNumber: '5448280000000007',
      expMonth: '12',
      expYear: '2030',
      holderName: 'TESTE',
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.bin).toBe('544828');
    expect((result as any).tokenizationId).toBeUndefined(); // DTO não expõe
    expect(savedCardRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      tokenizationId: 'tok-uuid',
      email: 'user@test.com',
      lastFour: '0007',
      holderName: 'TESTE',
      status: 'PENDING',
    }));
  });

  it('quando sync imediato falha, retorna DTO com status PENDING (não propaga erro)', async () => {
    vi.mocked(eRedeService.tokenizeCardCofre).mockResolvedValueOnce({ tokenizationId: 'tok-uuid' });
    vi.mocked(savedCardRepository.create).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.queryTokenization).mockRejectedValueOnce(new Error('5xx eRede'));

    const result = await savedCardService.tokenizeAndSave({
      userId: 'user-1',
      email: 'user@test.com',
      cardNumber: '5448280000000007',
      expMonth: '12',
      expYear: '2030',
      holderName: 'TESTE',
    });

    expect(result.status).toBe('PENDING');
  });

  it('propaga erro do tokenizeCardCofre', async () => {
    vi.mocked(eRedeService.tokenizeCardCofre).mockRejectedValueOnce(
      Object.assign(new Error('Cartão inválido'), { statusCode: 400 }),
    );

    await expect(
      savedCardService.tokenizeAndSave({
        userId: 'user-1',
        email: 'user@test.com',
        cardNumber: '0000',
        expMonth: '01',
        expYear: '2020',
        holderName: 'X',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('SavedCardService.listByUser', () => {
  it('retorna view pública (sem tokenizationId)', async () => {
    vi.mocked(savedCardRepository.findByUserId).mockResolvedValueOnce([
      makeCard(),
      makeCard({ id: 'card-2', tokenizationId: 'tok-2' }),
    ] as any);

    const result = await savedCardService.listByUser('user-1');

    expect(result).toHaveLength(2);
    result.forEach((c) => {
      expect((c as any).tokenizationId).toBeUndefined();
      expect(c.id).toBeDefined();
      expect(c.lastFour).toBeDefined();
    });
  });
});

describe('SavedCardService.deleteCard', () => {
  it('chama manageTokenization (delete) e repository.delete', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.manageTokenization).mockResolvedValueOnce({ returnCode: '00', returnMessage: 'OK' });
    vi.mocked(savedCardRepository.delete).mockResolvedValueOnce(makeCard() as any);

    await savedCardService.deleteCard('user-1', 'card-1');

    expect(eRedeService.manageTokenization).toHaveBeenCalledWith('tok-uuid', 'delete', 1);
    expect(savedCardRepository.delete).toHaveBeenCalledWith('card-1');
  });

  it('quando manageTokenization falha, ainda assim deleta localmente', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.manageTokenization).mockRejectedValueOnce(new Error('eRede 5xx'));
    vi.mocked(savedCardRepository.delete).mockResolvedValueOnce(makeCard() as any);

    await savedCardService.deleteCard('user-1', 'card-1');

    expect(savedCardRepository.delete).toHaveBeenCalledWith('card-1');
  });

  it('lança 404 quando cartão não existe', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(null);

    await expect(savedCardService.deleteCard('user-1', 'nope'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('lança 403 quando cartão não pertence ao user', async () => {
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(makeCard({ userId: 'other' }) as any);

    await expect(savedCardService.deleteCard('user-1', 'card-1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.FORBIDDEN });
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/__tests__/unit/services/SavedCardService.test.ts`

Expected: falhas — `SavedCardService` ainda usa `tokenizeCard` legado e API antiga.

- [ ] **Step 3: Substituir `src/services/SavedCardService.ts`**

```ts
import { StatusCodes } from 'http-status-codes';
import AppError from '../utils/AppError';
import savedCardRepository from '../repositories/SavedCardRepository';
import eRedeService from './ERedeService';
import type { SavedCard, SavedCardStatus } from '../../generated/prisma/client';

interface TokenizeAndSaveParams {
  userId: string;
  email: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  holderName: string;
  securityCode?: string;
}

interface SavedCardPublicView {
  id: string;
  status: SavedCardStatus;
  cardBrand: string | null;
  lastFour: string;
  holderName: string;
  bin: string | null;
  createdAt: Date;
}

function toPublicView(card: SavedCard): SavedCardPublicView {
  return {
    id: card.id,
    status: card.status,
    cardBrand: card.cardBrand,
    lastFour: card.lastFour,
    holderName: card.holderName,
    bin: card.bin,
    createdAt: card.createdAt,
  };
}

class SavedCardService {
  async tokenizeAndSave(params: TokenizeAndSaveParams): Promise<SavedCardPublicView> {
    const { tokenizationId } = await eRedeService.tokenizeCardCofre({
      email: params.email,
      cardNumber: params.cardNumber,
      expirationMonth: params.expMonth,
      expirationYear: params.expYear,
      cardholderName: params.holderName,
      securityCode: params.securityCode,
    });

    const lastFour = params.cardNumber.slice(-4);
    const created = await savedCardRepository.create({
      userId: params.userId,
      tokenizationId,
      status: 'PENDING',
      email: params.email,
      lastFour,
      holderName: params.holderName,
    });

    let final: SavedCard = created;
    try {
      const remote = await eRedeService.queryTokenization(tokenizationId);
      final = await savedCardRepository.updateStatus(created.id, {
        status: remote.status,
        bin: remote.bin ?? null,
        cardBrand: remote.brand ?? null,
        lastFour: remote.last4 ?? lastFour,
        brandTid: remote.brandTid ?? null,
        lastSyncedAt: new Date(),
      });
    } catch (_err) {
      // Sync best-effort: cartão fica PENDING e será promovido por webhook ou assertActiveForCharge.
    }

    return toPublicView(final);
  }

  async listByUser(userId: string): Promise<SavedCardPublicView[]> {
    const cards = await savedCardRepository.findByUserId(userId);
    return cards.map(toPublicView);
  }

  async deleteCard(userId: string, cardId: string): Promise<void> {
    const card = await savedCardRepository.findById(cardId);

    if (!card) {
      throw new AppError('Cartão não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (card.userId !== userId) {
      throw new AppError('Acesso negado.', StatusCodes.FORBIDDEN);
    }

    try {
      await eRedeService.manageTokenization(card.tokenizationId, 'delete', 1);
    } catch (err) {
      console.error('[SavedCardService] manageTokenization falhou (ignorando):', err);
    }

    await savedCardRepository.delete(cardId);
  }
}

export type { SavedCardPublicView };
export default new SavedCardService();
```

- [ ] **Step 4: Remover `tokenizeCard` legado de `src/services/ERedeService.ts`**

Localizar o método `async tokenizeCard(...)` (linhas ~136-191 originais) e **remover inteiro**, junto com `buildBasicAuth()` (não é mais usado por `createTransaction` nem `queryTransaction`). Confirmar que não restou nenhum uso de `eredePv` ou `eredeIntegrationKey`:

Run: `npx grep -nE "eredePv|eredeIntegrationKey|buildBasicAuth|tokenizeCard\b" src/services/ERedeService.ts`

Expected: vazio (ou só ocorrências dentro do método já removido).

- [ ] **Step 5: Remover testes do `tokenizeCard` legado em `ERedeService.test.ts`**

Localizar e remover blocos:
- `describe('ERedeService.tokenizeCard'` (3 testes)
- `describe('ERedeService.tokenizeCard — erro genérico de rede'`

Manter os tests do `tokenizeCardCofre` adicionados na Task 5.

- [ ] **Step 6: GREEN**

Run: `npm run test`

Expected: SavedCardService 8/8 + ERedeService completo passando + repositories OK. Lint:

Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/services/SavedCardService.ts src/services/ERedeService.ts src/__tests__/unit/services/SavedCardService.test.ts src/__tests__/unit/services/ERedeService.test.ts
git commit -m "refactor(erede): SavedCardService usa Cofre e remove tokenizeCard legado

tokenizeAndSave: tokenizeCardCofre + persist PENDING + sync imediato
best-effort. listByUser retorna SavedCardPublicView (sem tokenizationId).
deleteCard chama manageTokenization (best-effort) antes de deletar local.
Remove tokenizeCard antigo (origem do bug 503) e buildBasicAuth do
ERedeService — não há mais Basic auth no service."
```

---

## Task 13: `SavedCardService.assertActiveForCharge` + `syncFromWebhook`

**Files:**
- Modify: `src/services/SavedCardService.ts`
- Modify: `src/__tests__/unit/services/SavedCardService.test.ts`

- [ ] **Step 1: Adicionar testes RED**

Adicionar no fim de `SavedCardService.test.ts`:

```ts
describe('SavedCardService.assertActiveForCharge', () => {
  it('retorna o cartão quando já está ACTIVE', async () => {
    vi.mocked(savedCardRepository.findActiveForUser).mockResolvedValueOnce(
      makeCard({ status: 'ACTIVE' }) as any,
    );

    const result = await savedCardService.assertActiveForCharge('user-1', 'card-1');

    expect(result.status).toBe('ACTIVE');
    expect(eRedeService.queryTokenization).not.toHaveBeenCalled();
  });

  it('lança 404 quando cartão não pertence ao user', async () => {
    vi.mocked(savedCardRepository.findActiveForUser).mockResolvedValueOnce(null);

    await expect(savedCardService.assertActiveForCharge('user-1', 'card-1'))
      .rejects.toMatchObject({ statusCode: StatusCodes.NOT_FOUND });
  });

  it('quando PENDING, faz sync e retorna ACTIVE se Rede confirmar', async () => {
    vi.mocked(savedCardRepository.findActiveForUser).mockResolvedValueOnce(
      makeCard({ status: 'PENDING' }) as any,
    );
    vi.mocked(eRedeService.queryTokenization).mockResolvedValueOnce({
      tokenizationId: 'tok-uuid',
      status: 'ACTIVE',
      raw: {},
    });
    vi.mocked(savedCardRepository.updateStatus).mockResolvedValueOnce(
      makeCard({ status: 'ACTIVE' }) as any,
    );
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(
      makeCard({ status: 'ACTIVE' }) as any,
    );

    const result = await savedCardService.assertActiveForCharge('user-1', 'card-1');

    expect(result.status).toBe('ACTIVE');
    expect(eRedeService.queryTokenization).toHaveBeenCalled();
  });

  it('lança 422 quando ainda não está ACTIVE após sync', async () => {
    vi.mocked(savedCardRepository.findActiveForUser).mockResolvedValueOnce(
      makeCard({ status: 'PENDING' }) as any,
    );
    vi.mocked(eRedeService.queryTokenization).mockResolvedValueOnce({
      tokenizationId: 'tok-uuid',
      status: 'INACTIVE',
      raw: {},
    });
    vi.mocked(savedCardRepository.updateStatus).mockResolvedValueOnce(
      makeCard({ status: 'INACTIVE' }) as any,
    );
    vi.mocked(savedCardRepository.findById).mockResolvedValueOnce(
      makeCard({ status: 'INACTIVE' }) as any,
    );

    await expect(savedCardService.assertActiveForCharge('user-1', 'card-1'))
      .rejects.toMatchObject({
        statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
        message: expect.stringContaining('INACTIVE'),
      });
  });
});

describe('SavedCardService.syncFromWebhook', () => {
  it('atualiza status quando cartão existe', async () => {
    vi.mocked(savedCardRepository.findByTokenizationId).mockResolvedValueOnce(makeCard() as any);
    vi.mocked(eRedeService.queryTokenization).mockResolvedValueOnce({
      tokenizationId: 'tok-uuid',
      status: 'ACTIVE',
      bin: '544828',
      brand: 'MASTERCARD',
      brandTid: 'btid-1',
      raw: {},
    });
    vi.mocked(savedCardRepository.updateStatus).mockResolvedValueOnce(makeCard() as any);

    await savedCardService.syncFromWebhook('tok-uuid');

    expect(savedCardRepository.updateStatus).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({ status: 'ACTIVE', bin: '544828', cardBrand: 'MASTERCARD' }),
    );
  });

  it('ignora silenciosamente quando cartão não encontrado (outro PV)', async () => {
    vi.mocked(savedCardRepository.findByTokenizationId).mockResolvedValueOnce(null);

    await savedCardService.syncFromWebhook('tok-de-outro-pv');

    expect(eRedeService.queryTokenization).not.toHaveBeenCalled();
    expect(savedCardRepository.updateStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: RED**

Run: `npx vitest run src/__tests__/unit/services/SavedCardService.test.ts -t "assertActiveForCharge|syncFromWebhook"`

- [ ] **Step 3: Implementar em `SavedCardService.ts`**

Adicionar dentro da classe (após `deleteCard`):

```ts
  async assertActiveForCharge(userId: string, savedCardId: string): Promise<SavedCard> {
    const card = await savedCardRepository.findActiveForUser(userId, savedCardId);

    if (!card) {
      throw new AppError('Cartão salvo não encontrado.', StatusCodes.NOT_FOUND);
    }

    if (card.status === 'ACTIVE') {
      return card;
    }

    await this.syncFromWebhook(card.tokenizationId);
    const refreshed = await savedCardRepository.findById(savedCardId);

    if (refreshed?.status !== 'ACTIVE') {
      throw new AppError(
        `Cartão não está ativo (status: ${refreshed?.status ?? 'desconhecido'}).`,
        StatusCodes.UNPROCESSABLE_ENTITY,
      );
    }

    return refreshed;
  }

  async syncFromWebhook(tokenizationId: string): Promise<void> {
    const card = await savedCardRepository.findByTokenizationId(tokenizationId);
    if (!card) return;

    const remote = await eRedeService.queryTokenization(tokenizationId);

    await savedCardRepository.updateStatus(card.id, {
      status: remote.status,
      bin: remote.bin ?? null,
      cardBrand: remote.brand ?? null,
      lastFour: remote.last4 ?? card.lastFour,
      brandTid: remote.brandTid ?? null,
      lastSyncedAt: new Date(),
    });
  }
```

- [ ] **Step 4: GREEN**

Run: `npx vitest run src/__tests__/unit/services/SavedCardService.test.ts`

Expected: todos passando.

- [ ] **Step 5: Suite + lint**

Run: `npm run test && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/services/SavedCardService.ts src/__tests__/unit/services/SavedCardService.test.ts
git commit -m "feat(erede): assertActiveForCharge e syncFromWebhook

assertActiveForCharge: bloqueia cobrança se status != ACTIVE; tenta sync
on-demand antes de desistir (404 vira 422 com mensagem sobre status).
syncFromWebhook: lê tokenizationId, busca card, faz queryTokenization e
atualiza status. Cartão de outro PV é ignorado silenciosamente."
```

---

## Task 14: Webhook (`EredeWebhookRepository` + `Service` + `Controller` + rota)

**Files:**
- Create: `src/repositories/EredeWebhookRepository.ts`
- Create: `src/__tests__/unit/repositories/EredeWebhookRepository.test.ts`
- Create: `src/services/EredeWebhookService.ts`
- Create: `src/__tests__/unit/services/EredeWebhookService.test.ts`
- Create: `src/controllers/EredeWebhookController.ts`
- Create: `src/__tests__/unit/controllers/EredeWebhookController.test.ts`
- Create: `src/routes/eredeWebhookRoutes.ts`
- Modify: `src/routes/index.ts` — montar `/erede`
- Modify: `src/repositories/PaymentRepository.ts` — adicionar `findByGatewayTransactionId` se não existir + `update`
- Modify: `src/repositories/PaymentRepository.ts` — adicionar `updateByTid`

**Contexto:** É a task maior do plano. Vou dividir em sub-passos por arquivo.

### 14a — `PaymentRepository.updateByTid`

- [ ] **Step 1: Verificar `PaymentRepository.ts` atual**

Run: `npx grep -nE "findByGatewayTransactionId|updateByTid" src/repositories/PaymentRepository.ts`

Se `findByGatewayTransactionId` já existe (sim, é usado em `PaymentService.processGatewayCallback`), só adicionar `updateByTid`.

- [ ] **Step 2: Adicionar teste em `tests/unit/repositories/PaymentRepository.test.ts`** (criar se não existir, ou adicionar ao existente)

Run primeiro: `ls src/__tests__/unit/repositories/`

Se `PaymentRepository.test.ts` existir, adicionar caso. Senão, criar com mínimo:

```ts
// src/__tests__/unit/repositories/PaymentRepository.test.ts (criar se ausente)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    payment: { update: vi.fn(), findFirst: vi.fn() },
  },
}));

import paymentRepository from '../../../repositories/PaymentRepository';
import prisma from '../../../config/database';

beforeEach(() => { vi.clearAllMocks(); });

describe('PaymentRepository.updateByTid', () => {
  it('atualiza pelo gatewayTransactionId', async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValueOnce({ id: 'p1' } as any);
    vi.mocked(prisma.payment.update).mockResolvedValueOnce({ id: 'p1', status: 'PAGO' } as any);

    const result = await paymentRepository.updateByTid('tid-123', { status: 'PAGO' });

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { gatewayTransactionId: 'tid-123' },
      select: { id: true },
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'PAGO' },
    });
    expect(result?.status).toBe('PAGO');
  });

  it('retorna null quando payment não encontrado', async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValueOnce(null);

    const result = await paymentRepository.updateByTid('tid-nope', { status: 'PAGO' });

    expect(result).toBeNull();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: RED**

Run: `npx vitest run src/__tests__/unit/repositories/PaymentRepository.test.ts -t updateByTid`

- [ ] **Step 4: Implementar `updateByTid` em `src/repositories/PaymentRepository.ts`**

Adicionar método na classe:

```ts
  async updateByTid(tid: string, data: Prisma.PaymentUpdateInput) {
    const found = await prisma.payment.findFirst({
      where: { gatewayTransactionId: tid },
      select: { id: true },
    });
    if (!found) return null;
    return await prisma.payment.update({ where: { id: found.id }, data });
  }
```

(Se `Prisma` não estiver importado, adicionar `import type { Prisma } from '../../generated/prisma/client';`.)

- [ ] **Step 5: GREEN**

Run: `npx vitest run src/__tests__/unit/repositories/PaymentRepository.test.ts`

### 14b — `EredeWebhookRepository`

- [ ] **Step 6: Criar testes em `src/__tests__/unit/repositories/EredeWebhookRepository.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  default: {
    eredeWebhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import eredeWebhookRepository from '../../../repositories/EredeWebhookRepository';
import prisma from '../../../config/database';

beforeEach(() => { vi.clearAllMocks(); });

describe('EredeWebhookRepository.findByExternalId', () => {
  it('busca por externalId UNIQUE', async () => {
    vi.mocked(prisma.eredeWebhookEvent.findUnique).mockResolvedValueOnce({ id: 'e1' } as any);
    const result = await eredeWebhookRepository.findByExternalId('req-123');
    expect(prisma.eredeWebhookEvent.findUnique).toHaveBeenCalledWith({ where: { externalId: 'req-123' } });
    expect(result?.id).toBe('e1');
  });
});

describe('EredeWebhookRepository.create', () => {
  it('persiste evento bruto com processed=false', async () => {
    vi.mocked(prisma.eredeWebhookEvent.create).mockResolvedValueOnce({ id: 'e1' } as any);

    await eredeWebhookRepository.create({
      externalId: 'req-123',
      eventType: 'TOKENIZATION',
      events: ['PV.TOKENIZACAO-BANDEIRA'],
      payload: { tokenizationId: 'tok-uuid' },
    });

    expect(prisma.eredeWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalId: 'req-123',
        eventType: 'TOKENIZATION',
        processed: false,
      }),
    });
  });
});

describe('EredeWebhookRepository.markProcessed', () => {
  it('atualiza processed=true e processedAt', async () => {
    vi.mocked(prisma.eredeWebhookEvent.update).mockResolvedValueOnce({} as any);

    await eredeWebhookRepository.markProcessed('e1');

    expect(prisma.eredeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ processed: true, processedAt: expect.any(Date) }),
    });
  });
});

describe('EredeWebhookRepository.markFailed', () => {
  it('grava errorMessage e mantém processed=false', async () => {
    vi.mocked(prisma.eredeWebhookEvent.update).mockResolvedValueOnce({} as any);

    await eredeWebhookRepository.markFailed('e1', 'Timeout no GET tokenization');

    expect(prisma.eredeWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { processed: false, errorMessage: 'Timeout no GET tokenization' },
    });
  });
});
```

- [ ] **Step 7: RED**

Run: `npx vitest run src/__tests__/unit/repositories/EredeWebhookRepository.test.ts`

- [ ] **Step 8: Criar `src/repositories/EredeWebhookRepository.ts`**

```ts
import prisma from '../config/database';
import type { EredeWebhookEvent, EredeWebhookEventType, Prisma } from '../../generated/prisma/client';

interface CreateEventInput {
  externalId: string;
  eventType: EredeWebhookEventType;
  events: string[];
  payload: Record<string, unknown>;
}

class EredeWebhookRepository {
  async findByExternalId(externalId: string): Promise<EredeWebhookEvent | null> {
    return await prisma.eredeWebhookEvent.findUnique({ where: { externalId } });
  }

  async create(data: CreateEventInput): Promise<EredeWebhookEvent> {
    return await prisma.eredeWebhookEvent.create({
      data: {
        externalId: data.externalId,
        eventType: data.eventType,
        events: data.events as unknown as Prisma.InputJsonValue,
        payload: data.payload as unknown as Prisma.InputJsonValue,
        processed: false,
      },
    });
  }

  async markProcessed(id: string): Promise<EredeWebhookEvent> {
    return await prisma.eredeWebhookEvent.update({
      where: { id },
      data: { processed: true, processedAt: new Date(), errorMessage: null },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<EredeWebhookEvent> {
    return await prisma.eredeWebhookEvent.update({
      where: { id },
      data: { processed: false, errorMessage },
    });
  }
}

export default new EredeWebhookRepository();
```

Adicionar em `src/types/index.ts` re-export:

```ts
export type {
  // ... existentes
  EredeWebhookEvent,
} from '../../generated/prisma/client';

export {
  // ... existentes
  EredeWebhookEventType,
} from '../../generated/prisma/client';
```

- [ ] **Step 9: GREEN repository**

Run: `npx vitest run src/__tests__/unit/repositories/EredeWebhookRepository.test.ts`

### 14c — `EredeWebhookService`

- [ ] **Step 10: Criar testes em `src/__tests__/unit/services/EredeWebhookService.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/SavedCardService', () => ({
  default: { syncFromWebhook: vi.fn() },
}));

vi.mock('../../../services/ERedeService', () => ({
  default: { queryTransaction: vi.fn(), mapStatusToLocal: vi.fn() },
}));

vi.mock('../../../repositories/PaymentRepository', () => ({
  default: { updateByTid: vi.fn() },
}));

import eredeWebhookService from '../../../services/EredeWebhookService';
import savedCardService from '../../../services/SavedCardService';
import eRedeService from '../../../services/ERedeService';
import paymentRepository from '../../../repositories/PaymentRepository';

beforeEach(() => { vi.clearAllMocks(); });

describe('EredeWebhookService.syncTokenization', () => {
  it('delega para SavedCardService.syncFromWebhook', async () => {
    vi.mocked(savedCardService.syncFromWebhook).mockResolvedValueOnce(undefined);

    await eredeWebhookService.syncTokenization('tok-uuid');

    expect(savedCardService.syncFromWebhook).toHaveBeenCalledWith('tok-uuid');
  });
});

describe('EredeWebhookService.syncTransaction', () => {
  it('busca transação na Rede, mapeia status e atualiza payment', async () => {
    vi.mocked(eRedeService.queryTransaction).mockResolvedValueOnce({
      tid: 'tid-1', returnCode: '00', returnMessage: 'OK', status: 0, amount: 1000, reference: 'TPW-1', raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.updateByTid).mockResolvedValueOnce({ id: 'p1', status: 'PAGO' } as any);

    await eredeWebhookService.syncTransaction('tid-1');

    expect(eRedeService.queryTransaction).toHaveBeenCalledWith('tid-1');
    expect(paymentRepository.updateByTid).toHaveBeenCalledWith('tid-1', expect.objectContaining({ status: 'PAGO' }));
  });

  it('ignora silenciosamente quando payment não encontrado', async () => {
    vi.mocked(eRedeService.queryTransaction).mockResolvedValueOnce({
      tid: 'tid-x', returnCode: '00', returnMessage: 'OK', status: 0, amount: 1000, reference: 'r', raw: {},
    });
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.updateByTid).mockResolvedValueOnce(null);

    // não lança
    await eredeWebhookService.syncTransaction('tid-x');
  });
});
```

- [ ] **Step 11: RED**

Run: `npx vitest run src/__tests__/unit/services/EredeWebhookService.test.ts`

- [ ] **Step 12: Criar `src/services/EredeWebhookService.ts`**

```ts
import savedCardService from './SavedCardService';
import eRedeService from './ERedeService';
import paymentRepository from '../repositories/PaymentRepository';

class EredeWebhookService {
  async syncTokenization(tokenizationId: string): Promise<void> {
    await savedCardService.syncFromWebhook(tokenizationId);
  }

  async syncTransaction(tid: string): Promise<void> {
    const remote = await eRedeService.queryTransaction(tid);
    const localStatus = eRedeService.mapStatusToLocal(remote.returnCode, remote.status);

    await paymentRepository.updateByTid(tid, {
      status: localStatus,
      gatewayStatusCode: remote.returnCode,
      gatewayStatusMessage: remote.returnMessage,
    });
  }
}

export default new EredeWebhookService();
```

- [ ] **Step 13: GREEN**

Run: `npx vitest run src/__tests__/unit/services/EredeWebhookService.test.ts`

### 14d — `EredeWebhookController`

- [ ] **Step 14: Criar testes em `src/__tests__/unit/controllers/EredeWebhookController.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../repositories/EredeWebhookRepository', () => ({
  default: {
    findByExternalId: vi.fn(),
    create: vi.fn(),
    markProcessed: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock('../../../services/EredeWebhookService', () => ({
  default: { syncTokenization: vi.fn(), syncTransaction: vi.fn() },
}));

import eredeWebhookController from '../../../controllers/EredeWebhookController';
import eredeWebhookRepository from '../../../repositories/EredeWebhookRepository';
import eredeWebhookService from '../../../services/EredeWebhookService';

const mockRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn().mockImplementation((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn().mockImplementation((b: any) => { res.body = b; return res; });
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EREDE_CALLBACK_SECRET;
});

afterEach(() => { delete process.env.EREDE_CALLBACK_SECRET; });

describe('EredeWebhookController.handle — validações', () => {
  it('rejeita 401 quando secret configurado e header diverge', async () => {
    process.env.EREDE_CALLBACK_SECRET = 'expected';
    const req: any = { headers: { 'x-erede-secret': 'wrong', 'request-id': 'r1' }, body: {} };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(401);
  });

  it('aceita quando secret não configurado (sandbox)', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok-uuid' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
  });

  it('rejeita 400 quando Request-ID ausente', async () => {
    const req: any = { headers: {}, body: { eventType: 'PV.TOKENIZACAO-X' } };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Request-ID');
  });

  it('rejeita 400 quando eventType desconhecido', async () => {
    const req: any = { headers: { 'request-id': 'r1' }, body: { eventType: 'UNKNOWN' } };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Evento');
  });
});

describe('EredeWebhookController.handle — idempotência', () => {
  it('duplicata processed=true → 200 com duplicate=true', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce({
      id: 'e1', processed: true,
    } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(eredeWebhookService.syncTokenization).not.toHaveBeenCalled();
  });

  it('duplicata processed=false → re-tenta processar', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce({
      id: 'e1', processed: false,
    } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookRepository.create).not.toHaveBeenCalled();
    expect(eredeWebhookService.syncTokenization).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});

describe('EredeWebhookController.handle — dispatch e erros', () => {
  it('TOKENIZATION dispara syncTokenization e marca processed', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok-1' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookService.syncTokenization).toHaveBeenCalledWith('tok-1');
    expect(eredeWebhookRepository.markProcessed).toHaveBeenCalledWith('e1');
    expect(res.statusCode).toBe(200);
  });

  it('TRANSACAO dispara syncTransaction', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTransaction).mockResolvedValueOnce(undefined);
    vi.mocked(eredeWebhookRepository.markProcessed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TRANSACAO-AUTORIZADA', tid: 'tid-1' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookService.syncTransaction).toHaveBeenCalledWith('tid-1');
  });

  it('falha no processamento → marca failed e responde 500', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookService.syncTokenization).mockRejectedValueOnce(new Error('Timeout'));
    vi.mocked(eredeWebhookRepository.markFailed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA', tokenizationId: 'tok' },
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookRepository.markFailed).toHaveBeenCalledWith('e1', expect.stringContaining('Timeout'));
    expect(res.statusCode).toBe(500);
  });

  it('payload sem tokenizationId em evento de TOKENIZACAO → marca failed', async () => {
    vi.mocked(eredeWebhookRepository.findByExternalId).mockResolvedValueOnce(null);
    vi.mocked(eredeWebhookRepository.create).mockResolvedValueOnce({ id: 'e1' } as any);
    vi.mocked(eredeWebhookRepository.markFailed).mockResolvedValueOnce({ id: 'e1' } as any);

    const req: any = {
      headers: { 'request-id': 'r1' },
      body: { eventType: 'PV.TOKENIZACAO-BANDEIRA' }, // sem tokenizationId
    };
    const res = mockRes();

    await eredeWebhookController.handle(req, res, vi.fn());

    expect(eredeWebhookRepository.markFailed).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 15: RED**

Run: `npx vitest run src/__tests__/unit/controllers/EredeWebhookController.test.ts`

- [ ] **Step 16: Criar `src/controllers/EredeWebhookController.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { eredeCallbackSecret } from '../config/erede';
import eredeWebhookRepository from '../repositories/EredeWebhookRepository';
import eredeWebhookService from '../services/EredeWebhookService';
import type { EredeWebhookEventType } from '../../generated/prisma/client';

interface WebhookBody {
  eventType?: string;
  tokenizationId?: string;
  tid?: string;
  [key: string]: unknown;
}

class EredeWebhookController {
  async handle(req: Request, res: Response, _next: NextFunction): Promise<void> {
    // 5.2.1 — secret
    if (eredeCallbackSecret) {
      const provided = req.headers['x-erede-secret'];
      if (provided !== eredeCallbackSecret) {
        res.status(StatusCodes.UNAUTHORIZED).json({ status: 'fail', message: 'Webhook não autorizado' });
        return;
      }
    }

    // 5.2.2 — Request-ID
    const externalId = (req.headers['request-id'] as string | undefined) ?? '';
    if (!externalId) {
      res.status(StatusCodes.BAD_REQUEST).json({ status: 'fail', message: 'Request-ID obrigatório' });
      return;
    }

    // 5.2.3 — eventType
    const body = (req.body ?? {}) as WebhookBody;
    const eventTypeRaw = String(body.eventType ?? '');
    const isToken = eventTypeRaw.startsWith('PV.TOKENIZACAO');
    const isTx = eventTypeRaw.startsWith('PV.TRANSACAO');
    if (!isToken && !isTx) {
      res.status(StatusCodes.BAD_REQUEST).json({ status: 'fail', message: 'Evento não suportado' });
      return;
    }

    const eventType: EredeWebhookEventType = isToken ? 'TOKENIZATION' : 'TRANSACTION';

    // 5.3 — idempotência
    const existing = await eredeWebhookRepository.findByExternalId(externalId);
    let eventId: string;
    if (existing) {
      if (existing.processed) {
        res.status(StatusCodes.OK).json({ status: 'ok', duplicate: true });
        return;
      }
      eventId = existing.id;
    } else {
      const created = await eredeWebhookRepository.create({
        externalId,
        eventType,
        events: [eventTypeRaw],
        payload: body,
      });
      eventId = created.id;
    }

    // 5.4-5.5 — processar
    try {
      if (eventType === 'TOKENIZATION') {
        const tokenizationId = String(body.tokenizationId ?? '');
        if (!tokenizationId) {
          throw new Error('payload sem tokenizationId');
        }
        await eredeWebhookService.syncTokenization(tokenizationId);
      } else {
        const tid = String(body.tid ?? '');
        if (!tid) {
          throw new Error('payload sem tid');
        }
        await eredeWebhookService.syncTransaction(tid);
      }

      await eredeWebhookRepository.markProcessed(eventId);
      res.status(StatusCodes.OK).json({ status: 'ok' });
    } catch (err) {
      const errorMessage = (err as Error).message;
      await eredeWebhookRepository.markFailed(eventId, errorMessage);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: 'error', message: errorMessage });
    }
  }
}

export default new EredeWebhookController();
```

- [ ] **Step 17: GREEN controller**

Run: `npx vitest run src/__tests__/unit/controllers/EredeWebhookController.test.ts`

### 14e — Rota e montagem

- [ ] **Step 18: Criar `src/routes/eredeWebhookRoutes.ts`**

```ts
import { Router, Request, Response, NextFunction } from 'express';
import eredeWebhookController from '../controllers/EredeWebhookController';

const router = Router();

/**
 * @swagger
 * /erede/webhook:
 *   post:
 *     tags: [eRede]
 *     summary: Webhook da eRede (sem autenticação JWT)
 *     description: |
 *       Endpoint chamado pelo gateway eRede para notificar eventos de
 *       tokenização (PV.TOKENIZACAO-*) e transação (PV.TRANSACAO-*).
 *       Idempotência via header Request-ID. Secret opcional via X-Erede-Secret.
 *     parameters:
 *       - in: header
 *         name: Request-ID
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: X-Erede-Secret
 *         required: false
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType: { type: string, example: 'PV.TOKENIZACAO-BANDEIRA' }
 *               tokenizationId: { type: string }
 *               tid: { type: string }
 *     responses:
 *       200: { description: Evento processado (ou duplicata) }
 *       400: { description: Header ou body inválido }
 *       401: { description: Secret inválido }
 *       500: { description: Falha no processamento — Rede deve reentregar }
 */
router.post('/webhook', (req: Request, res: Response, next: NextFunction) =>
  eredeWebhookController.handle(req, res, next),
);

export default router;
```

- [ ] **Step 19: Modificar `src/routes/index.ts` — montar rota**

```ts
import { Router } from 'express';
import authRoutes from './authRoutes';
import debtRoutes from './debtRoutes';
import paymentRoutes from './paymentRoutes';
import paymentHistoryRoutes from './paymentHistoryRoutes';
import adminRoutes from './adminRoutes';
import userRoutes from './userRoutes';
import eredeWebhookRoutes from './eredeWebhookRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/debts', debtRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-history', paymentHistoryRoutes);
router.use('/admin', adminRoutes);
router.use('/users', userRoutes);
router.use('/erede', eredeWebhookRoutes);

export default router;
```

- [ ] **Step 20: Suite + lint**

Run: `npm run test && npm run lint`

Expected: todos os novos passam. PaymentService.test.ts ainda pode quebrar (Task 15 ajusta).

- [ ] **Step 21: Commit**

```bash
git add src/repositories/EredeWebhookRepository.ts \
        src/repositories/PaymentRepository.ts \
        src/services/EredeWebhookService.ts \
        src/controllers/EredeWebhookController.ts \
        src/routes/eredeWebhookRoutes.ts \
        src/routes/index.ts \
        src/types/index.ts \
        src/__tests__/unit/repositories/EredeWebhookRepository.test.ts \
        src/__tests__/unit/repositories/PaymentRepository.test.ts \
        src/__tests__/unit/services/EredeWebhookService.test.ts \
        src/__tests__/unit/controllers/EredeWebhookController.test.ts
git commit -m "feat(erede): webhook completo (idempotência + audit + dispatch)

POST /api/erede/webhook (sem authMiddleware). Validações: X-Erede-Secret
opcional, Request-ID obrigatório, eventType prefixado. Idempotência via
EredeWebhookEvent.externalId UNIQUE — duplicata processed=true vira 200
silencioso, processed=false re-tenta. Eventos PV.TOKENIZACAO-* delegam
para SavedCardService.syncFromWebhook; PV.TRANSACAO-* dispara
queryTransaction + paymentRepository.updateByTid. Falha → 500 + markFailed
(Rede retenta nos próprios timers)."
```

---

## Task 15: `PaymentService.create` integra `assertActiveForCharge`

**Files:**
- Modify: `src/services/PaymentService.ts:145-185` — bloco do `savedCardId`
- Modify: `src/services/PaymentService.ts:188-210` — persistência inclui campos novos
- Modify: `src/__tests__/unit/services/PaymentService.test.ts`

- [ ] **Step 1: Ler tests atuais relevantes**

Run: `npx grep -nE "savedCardId|tokenizeAndSave|cardToken" src/__tests__/unit/services/PaymentService.test.ts | head -30`

- [ ] **Step 2: Adicionar testes RED**

Adicionar no fim de `PaymentService.test.ts`:

```ts
describe('PaymentService.create — savedCardId (Cofre)', () => {
  it('chama assertActiveForCharge e usa tokenizationId como cardToken', async () => {
    // Setup: débito válido + cartão ACTIVE
    const debt = makeDebt({ valor: 1000 });
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([debt] as any);
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce({
      id: 'card-1', userId: 'user-1', tokenizationId: 'tok-cofre', status: 'ACTIVE',
    } as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-1', returnCode: '00', returnMessage: 'OK', reference: 'TPW-x',
      cardBin: '544828', brandTid: 'btid-1', transactionLinkId: 'link-1', raw: {},
    } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce({ id: 'p1', userId: 'user-1' } as any);
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({ id: 'p1' } as any);

    await paymentService.create('user-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'card-1',
      card: { number: '', expMonth: '12', expYear: '2030', cvv: '123', holderName: 'X' },
      billing: { name: 'X', email: 'x@x.com', phone: '11', document: '111', birthDate: '2000-01-01', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    });

    expect(savedCardService.assertActiveForCharge).toHaveBeenCalledWith('user-1', 'card-1');
    const buildCall = vi.mocked(eRedeService.buildCreditPayload).mock.calls[0][0];
    expect(buildCall.cardToken).toBe('tok-cofre');
  });

  it('persiste savedCardId, cardBin, brandTid, transactionLinkId no payment', async () => {
    const debt = makeDebt({ valor: 1000 });
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([debt] as any);
    vi.mocked(savedCardService.assertActiveForCharge).mockResolvedValueOnce({
      id: 'card-1', tokenizationId: 'tok-cofre', status: 'ACTIVE',
    } as any);
    vi.mocked(eRedeService.createTransaction).mockResolvedValueOnce({
      tid: 'tid-1', returnCode: '00', returnMessage: 'OK', reference: 'TPW-x',
      cardBin: '544828', brandTid: 'btid-1', transactionLinkId: 'link-1', raw: {},
    } as any);
    vi.mocked(eRedeService.mapStatusToLocal).mockReturnValueOnce('PAGO');
    vi.mocked(paymentRepository.create).mockResolvedValueOnce({ id: 'p1', userId: 'user-1' } as any);
    vi.mocked(paymentRepository.update).mockResolvedValueOnce({ id: 'p1' } as any);

    await paymentService.create('user-1', {
      debtIds: ['d1'],
      method: 'CARTAO_CREDITO',
      installments: 1,
      savedCardId: 'card-1',
      card: { number: '', expMonth: '12', expYear: '2030', cvv: '123', holderName: 'X' },
      billing: { name: 'X', email: 'x@x.com', phone: '11', document: '111', birthDate: '2000-01-01', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
    });

    expect(paymentRepository.update).toHaveBeenCalledWith('p1', expect.objectContaining({
      savedCardId: 'card-1',
      cardBin: '544828',
      brandTid: 'btid-1',
      transactionLinkId: 'link-1',
    }));
  });

  it('propaga 422 quando assertActiveForCharge falha', async () => {
    const debt = makeDebt({ valor: 1000 });
    vi.mocked(debtRepository.findByIds).mockResolvedValueOnce([debt] as any);
    vi.mocked(savedCardService.assertActiveForCharge).mockRejectedValueOnce(
      Object.assign(new Error('Cartão não está ativo'), { statusCode: 422 }),
    );

    await expect(
      paymentService.create('user-1', {
        debtIds: ['d1'],
        method: 'CARTAO_CREDITO',
        installments: 1,
        savedCardId: 'card-1',
        card: { number: '', expMonth: '12', expYear: '2030', cvv: '123', holderName: 'X' },
        billing: { name: 'X', email: 'x@x.com', phone: '11', document: '111', birthDate: '2000-01-01', address: 'R', district: 'D', city: 'C', state: 'SP', postalcode: '00000' },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
```

Verifique no topo do arquivo se `savedCardService` já é mock — se `tokenizeAndSave` aparece mockado, adicionar `assertActiveForCharge: vi.fn()` no objeto. Mesmo pra `eRedeService.buildCreditPayload`. Se faltar `makeDebt`, copiar do PaymentService.test.ts existente. Se algum mock de `paymentRepository.update` não existir, adicionar.

- [ ] **Step 3: RED**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts -t "savedCardId .Cofre."`

- [ ] **Step 4: Modificar `src/services/PaymentService.ts`**

Substituir o bloco que resolve `savedCardId` (atualmente linhas ~146-166) por:

```ts
    let cardToken: string | undefined;
    if (method === 'CARTAO_CREDITO' && savedCardId) {
      const savedCard = await savedCardService.assertActiveForCharge(userId, savedCardId);
      if (!card?.cvv) {
        throw new AppError('CVV é obrigatório ao pagar com cartão salvo.', StatusCodes.BAD_REQUEST);
      }
      cardToken = savedCard.tokenizationId;
      card = {
        number: '',
        expMonth: card?.expMonth || '',
        expYear: card?.expYear || '',
        cvv: card.cvv,
        holderName: savedCard.holderName,
      };
    }
```

E **logo após o `_persistPayment`** (depois da linha que cria `payment`), adicionar:

```ts
    // Persiste campos novos da Rede v2
    if (method === 'CARTAO_CREDITO' && (gatewayResponse.cardBin || gatewayResponse.brandTid || gatewayResponse.transactionLinkId || savedCardId)) {
      await paymentRepository.update(payment.id, {
        cardBin: gatewayResponse.cardBin ?? null,
        brandTid: gatewayResponse.brandTid ?? null,
        transactionLinkId: gatewayResponse.transactionLinkId ?? null,
        ...(savedCardId ? { savedCard: { connect: { id: savedCardId } } } : {}),
      });
    }
```

- [ ] **Step 5: GREEN**

Run: `npx vitest run src/__tests__/unit/services/PaymentService.test.ts -t "savedCardId .Cofre."`

Pode ser que outros testes do `PaymentService.test.ts` que usavam `savedCardRepository.findById` direto quebrem — substituir por `savedCardService.assertActiveForCharge` nas expectativas (revisar arquivo).

- [ ] **Step 6: Suite completa + lint**

Run: `npm run test && npm run lint`

Expected: 100% verde.

- [ ] **Step 7: Commit**

```bash
git add src/services/PaymentService.ts src/__tests__/unit/services/PaymentService.test.ts
git commit -m "feat(payments): integra assertActiveForCharge e persiste campos v2

PaymentService.create chama SavedCardService.assertActiveForCharge quando
savedCardId fornecido (422 se status != ACTIVE). cardToken passa a ser
tokenizationId. Após cobrança, persiste cardBin, brandTid,
transactionLinkId e ligação saved_card_id no Payment para auditoria
de chargebacks."
```

---

## Task 16: Atualizar `.env.example`, doc gateway-erede e Swagger

**Files:**
- Modify: `.env.example`
- Modify: `docs/design/gateway-erede.md`
- Modify: `src/routes/userRoutes.ts` — Swagger `POST /me/saved-cards` adiciona `email` automaticamente do JWT
- Modify: `src/controllers/UserController.ts` — `createSavedCard` passa `email: req.user.email`

- [ ] **Step 1: Atualizar `.env.example`**

Substituir bloco eRede por:

```env
# ===== eRede Gateway (OAuth 2.0 + Cofre de Cartões) =====
EREDE_CLIENT_ID=seu_client_id          # também usado no header Affiliation
EREDE_CLIENT_SECRET=seu_client_secret
EREDE_OAUTH_URL=https://rl7-sandbox-api.useredecloud.com.br/oauth2/token
EREDE_TOKEN_SERVICE_URL=https://rl7-sandbox-api.useredecloud.com.br/token-service/oauth/v2
EREDE_API_URL=https://sandbox-erede.useredecloud.com.br/v2/transactions
EREDE_TIMEOUT_MS=15000
EREDE_CALLBACK_SECRET=                 # opcional, valida X-Erede-Secret no webhook
EREDE_PIX_EXPIRATION_HOURS=24
EREDE_SOFT_DESCRIPTOR=Tuppeware
```

- [ ] **Step 2: Atualizar `docs/design/gateway-erede.md`**

Substituir tabela de envs (linha 9) e endpoints (linhas 23-25):

```markdown
| `EREDE_CLIENT_ID` | OAuth 2.0 client (também header Affiliation) |
| `EREDE_CLIENT_SECRET` | OAuth 2.0 client secret |
| `EREDE_OAUTH_URL` | URL do endpoint /oauth2/token |
| `EREDE_TOKEN_SERVICE_URL` | URL base do Cofre (/token-service/oauth/v2) |
| `EREDE_API_URL` | URL base v2 (ex: `https://api.userede.com.br/erede/v2/transactions`) |

| `POST` | `/v2/transactions` | Criar transação (PIX ou cartão) |
| `GET` | `/v2/transactions/{tid}` | Consultar status de transação |
| `POST` | `/token-service/oauth/v2/tokenization` | Tokenizar cartão no Cofre |
| `GET` | `/token-service/oauth/v2/tokenization/{id}` | Consultar status de tokenização |
| `POST` | `/token-service/oauth/v2/tokenization/{id}/management` | Deletar tokenização |
| `POST` | `/api/erede/webhook` | Receber eventos da Rede (sem JWT) |
```

- [ ] **Step 3: Modificar `UserController.createSavedCard` em `src/controllers/UserController.ts`**

Substituir o método (linhas 110-138 originais):

```ts
  async createSavedCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cardNumber, expMonth, expYear, holderName, securityCode } = req.body as {
        cardNumber: string;
        expMonth: string;
        expYear: string;
        holderName: string;
        securityCode?: string;
      };

      const card = await savedCardService.tokenizeAndSave({
        userId: req.user!.id,
        email: req.user!.email,
        cardNumber,
        expMonth,
        expYear,
        holderName,
        securityCode,
      });

      res.status(StatusCodes.CREATED).json({ status: 'success', data: card });
    } catch (error) {
      next(error);
    }
  }
```

Nota: `req.user!.email` já está no JWT (CLAUDE.md). Verificar:

Run: `npx grep -nE "email" src/middlewares/authMiddleware.ts`

Se email não estiver no `req.user`, adicionar (deve estar — CLAUDE.md cita `{ id, role, email, cpf }`).

- [ ] **Step 4: Atualizar Swagger em `src/routes/userRoutes.ts`** — `POST /me/saved-cards`

Adicionar `securityCode` opcional na schema (linhas 145-163):

```yaml
 *             properties:
 *               cardNumber:
 *                 type: string
 *                 example: '4111111111111111'
 *                 description: Número do cartão (13-19 dígitos)
 *               expMonth:
 *                 type: string
 *                 example: '12'
 *               expYear:
 *                 type: string
 *                 example: '2028'
 *               holderName:
 *                 type: string
 *                 example: 'JOAO DA SILVA'
 *               securityCode:
 *                 type: string
 *                 example: '123'
 *                 description: CVV opcional — se enviado, valida no momento da tokenização
```

E ajustar response 201 pra incluir `status` e remover menção ao token opaco:

```yaml
 *     responses:
 *       201:
 *         description: |
 *           Cartão tokenizado e salvo (Cofre eRede). O `tokenizationId` opaco
 *           NUNCA é retornado ao frontend. Status pode ser PENDING (sync via
 *           webhook) ou ACTIVE (sync imediato funcionou).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: 'success' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     status: { type: string, enum: [PENDING, ACTIVE, INACTIVE, FAILED] }
 *                     cardBrand: { type: string, nullable: true }
 *                     lastFour: { type: string }
 *                     holderName: { type: string }
 *                     bin: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Dados inválidos
 *       422:
 *         description: Tokenização recusada pela eRede (cartão inválido)
 *       502:
 *         description: Falha na comunicação com a eRede
```

- [ ] **Step 5: Atualizar validador `src/validators/savedCardValidator.ts`**

Run: `cat src/validators/savedCardValidator.ts`

Adicionar `securityCode` opcional. Caso o arquivo seja:

```ts
export const createSavedCardValidator = [
  body('cardNumber').isString().isLength({ min: 13, max: 19 }),
  body('expMonth').isString().isLength({ min: 2, max: 2 }),
  body('expYear').isString().isLength({ min: 4, max: 4 }),
  body('holderName').isString().isLength({ min: 1 }),
];
```

Adicionar:

```ts
  body('securityCode').optional().isString().isLength({ min: 3, max: 4 }),
```

- [ ] **Step 6: Suite + lint**

Run: `npm run test && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add .env.example docs/design/gateway-erede.md src/controllers/UserController.ts src/routes/userRoutes.ts src/validators/savedCardValidator.ts
git commit -m "docs(erede): atualizar .env.example, gateway-erede.md e Swagger

- .env.example: remove EREDE_PV/EREDE_INTEGRATION_KEY, adiciona OAuth vars
- gateway-erede.md: endpoints v2, /token-service/oauth/v2, webhook
- UserController.createSavedCard: passa email do JWT, aceita securityCode
- Swagger POST /users/me/saved-cards: response inclui status do Cofre
- Validator aceita securityCode opcional"
```

---

## Validação final pré-deploy

Antes de fazer push e deploy de prod (NÃO é uma task — é checklist humano):

- [ ] **Suite completa local**

Run: `npm run test`

Expected: 100% verde, suite cresceu pra ~400+ testes.

- [ ] **Build**

Run: `npm run build`

Expected: 0 erros TypeScript.

- [ ] **Lint**

Run: `npm run lint`

Expected: 0 erros.

- [ ] **Manual sandbox: OAuth funcionando**

```bash
node -e "require('./dist/src/services/EredeOAuthClient').default.getAccessToken().then(t => console.log('OK:', t.slice(0,20)+'...'))"
```

- [ ] **Manual sandbox: tokenizar cartão real (5448280000000007)**

```bash
curl -X POST http://localhost:3000/api/users/me/saved-cards \
  -H "Authorization: Bearer <jwt-do-user>" \
  -H "Content-Type: application/json" \
  -d '{"cardNumber":"5448280000000007","expMonth":"12","expYear":"2030","holderName":"TESTE"}'
```

Expected: 201 + `data.status === 'ACTIVE'` (sync imediato funcionou).

- [ ] **Manual sandbox: webhook simulado**

```bash
curl -X POST http://localhost:3000/api/erede/webhook \
  -H "Request-ID: test-req-1" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"PV.TOKENIZACAO-BANDEIRA","tokenizationId":"<id-real>"}'
```

Expected: 200 + linha em `erede_webhook_events` com `processed=true`.

- [ ] **Verificar settings no DB de prod (não rodar migration ainda)**

Antes de deploy: `SELECT COUNT(*) FROM saved_cards;` em prod. Confirmar que migration ALTER preserva qualquer linha.

- [ ] **Deploy procedure** (CLAUDE.md)

```bash
ssh tuppeware-deploy
cd /root/tuppeware_api
git pull --ff-only origin main
yarn install
yarn prisma:generate
yarn prisma:migrate deploy
yarn build
pm2 restart tuppeware-api --update-env
pm2 logs tuppeware-api --lines 30 --nostream
curl -sk https://api.tupperwarees.com.br/health
```

- [ ] **Smoke test prod**

Login → criar cartão real → cobrar com `savedCardId` → verificar webhook entrega.

---

## Self-review do plano

### Cobertura do spec

| Spec section | Tasks que implementam |
|---|---|
| 1 — Arquitetura geral | Tasks 4-15 (todas as componentes) |
| 2 — Schema | Tasks 1-3 |
| 3.1 — EredeOAuthClient | Task 4 |
| 3.2 — ERedeService refator | Tasks 5-10, 12 (remove tokenizeCard legado) |
| 3.3 — Config | Task 4 (parcial) + Task 16 (.env.example) |
| 3.4 — Catálogo de erros | Coberto no helper `_authedFetchJson` (Task 5) + `EredeOAuthClient` (Task 4) |
| 4.1 — SavedCardRepository | Task 11 |
| 4.2 — SavedCardService | Tasks 12-13 |
| 4.3 — UserController | Task 16 |
| 4.4 — Rotas | Task 16 (Swagger), code já existe |
| 4.5 — PaymentService | Task 15 |
| 5.1-5.8 — Webhook | Task 14 |
| 6.1 — Cobertura | Task 4-15 (unit only, integration NÃO escrito) ✓ decisão B |
| 6.2 — Mock fetch | Task 4 (padrão estabelecido) |
| 6.3 — Roteiro TDD | É este plano |
| 6.4 — 344 testes | Tasks 8-10 ajustam mocks, 12 ajusta SavedCardService.test, 15 ajusta PaymentService.test |
| 6.5 — Mocks | Distribuído nas tasks 8-15 |
| 6.6 — Critério done | Step "Suite + lint" em cada task |
| 6.7 — Validação pré-deploy | Bloco final do plano |

### Placeholder scan

Buscas mentais por "TBD", "TODO", "implement later", "..." em código de implementação: nenhum detectado. Todas as tasks têm código completo.

### Type consistency

- `tokenizationId` (camelCase) usado consistentemente em todas as tasks que lidam com SavedCard
- `EredeWebhookEventType` é o enum no Prisma; valores `'TOKENIZATION'` / `'TRANSACTION'` (uppercase) consistentes
- `assertActiveForCharge(userId, savedCardId)` — assinatura consistente entre Task 13 (definição) e Task 15 (consumidor)
- `SavedCardPublicView` exportado no Task 12 e usado implicitamente no controller (Task 16)
- `_authedFetchJson` (privado) definido no Task 5 e usado nos Tasks 6-9
- `ERedeTransactionResponse` campos novos (`cardBin`, `brandTid`, `transactionLinkId`) definidos no Task 8 e consumidos no Task 15

Sem inconsistências detectadas.

### Ambiguidades resolvidas

- Migration #1 ALTER vs DROP+CREATE → ALTER (decisão B, registrada na seção da Task 1)
- Idempotência duplicata processed=false → re-tenta (Task 14, Step 16, comportamento testado)
- Erro durante processamento → 500 + markFailed (Task 14, Step 16)
- `cardToken` omite cardHolderName/expirationMonth/expirationYear → Task 10 explícito

---

## Status do plano

**Pronto para execução.** Todas as 16 tasks com código completo, paths exatos e critério de done. Estimativa: ~4-6 horas de execução real (TDD inviolável + commits).

Caminho recomendado de execução: **inline (executing-plans)** dado que:
- O usuário autorizou auto mode até o fim
- Cada task tem todos os steps prontos
- Subagentes seriam over-kill pra este escopo

Sub-skill: `superpowers:executing-plans`.
