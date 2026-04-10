# CONCERNS.md — Technical Debt & Issues

## Critical Issues

### 1. Callback Signature Validation Opcional
- **File**: `src/controllers/PaymentController.ts` (lines ~32-39)
- **Issue**: Se `EREDE_CALLBACK_SECRET` não está configurado, qualquer callback é aceito — permite callbacks de pagamento forjados
- **Risk**: CRÍTICO
- **Fix**: Tornar validação de assinatura obrigatória

### 2. Fallback de JWT Secret Fraco
- **File**: `src/config/auth.ts`
- **Code**: `process.env.JWT_SECRET || 'default-secret-change-me'`
- **Issue**: Se `JWT_SECRET` não configurado, usa valor hardcoded trivialmente quebrável
- **Risk**: ALTO
- **Fix**: Falhar startup se `JWT_SECRET` ausente

### 3. CORS Permissivo
- **File**: `src/app.ts` ou similar
- **Issue**: CORS configurado com `*` em vez de restringir ao domínio do frontend
- **Risk**: MÉDIO

## Alta Prioridade

### 4. Índices Faltando no Schema
- **File**: `prisma/schema.prisma`
- **Faltam índices em**:
  - `User`: `email`, `cpf`, `role`
  - `Debt`: `status`, `numeroNf`, `dataVencimento`
  - `Payment`: `userId`, `status`
  - `Consultant`: `cpf`, `userId`
- **Impact**: Full table scans conforme dados crescem

### 5. N+1 Potencial — Consultant Lookup
- **File**: `src/services/DebtService.ts` (~linha 77)
- **Issue**: `consultantRepository.findByCpf(user.cpf)` chamado em toda request de autorização sem cache
- **Fix**: Cache no middleware de auth ou eager load

### 6. Precisão Decimal em Cálculos Financeiros
- **Files**: `src/services/PaymentService.ts` (~linha 49), `src/repositories/PaymentRepository.ts`
- **Code**: `parseFloat(d.valor.toString())`
- **Issue**: Conversão Prisma Decimal → string → float pode perder precisão em somas
- **Fix**: Operar diretamente com tipo Decimal

### 7. Type Assertions Excessivos
- **Files**: Múltiplos repositórios
- **Exemplos**: `as Prisma.PaymentWhereInput`, `req.body as Record<string, string>`
- **Issue**: Bypassam type checking do TypeScript, podem esconder bugs

### 8. Sem Logging Estruturado para Transações Financeiras
- **File**: `src/services/PaymentService.ts`
- **Issue**: Nenhum log estruturado para criação, alteração de status ou callbacks de pagamento — impede auditoria
- **Fix**: Adicionar Winston ou Pino para operações financeiras

## Média Prioridade

### 9. Non-null Assertions
- **File**: `src/services/PaymentService.ts` (~linha 112)
- **Code**: `eRedeService.buildCreditPayload({ ... card! ... })`
- **Issue**: Operador `!` bypassa checagem TypeScript

### 10. Magic Numbers Hardcoded
- **File**: `src/services/PaymentService.ts`
- **Exemplos**:
  - `CREDIT_CARD_FEE_RATE = 0.05` (5%)
  - `60 * 60 * 1000` (1 hora de expiração)
  - Thresholds de parcelamento (R$300, R$499.99, R$500)
- **Recommendation**: Migrar para tabela Settings ou env vars

### 11. Sistema de Settings Incompleto
- **Files**: `src/services/SettingsService.ts`, `src/repositories/SettingsRepository.ts`
- **Issue**: Tabela Settings existe mas só usada para `max_active_payment_links`; outras configs permanecem hardcoded

### 12. EmailService Sem Retry
- **File**: `src/services/EmailService.ts`
- **Issue**: Falhas no envio de email (ex: reset de senha) podem falhar silenciosamente

### 13. Lógica Complexa: PaymentService.reopenPayment
- **File**: `src/services/PaymentService.ts` (linhas ~291-351)
- **Issue**: Múltiplos branches (PIX vs CARTÃO, mesmo dia vs expirado) — difícil de testar exaustivamente
- **Fix**: Extrair para métodos separados ou state machine

### 14. Validadores Condicionais Complexos
- **File**: `src/validators/paymentValidator.ts`
- **Issue**: Condições `.if()` aninhadas tornam validação difícil de entender e testar

### 15. Lógica de Vinculação Consultor-Usuário Duplicada
- **Files**: `src/services/CsvImportService.ts`, `src/services/AuthService.ts`
- **Issue**: Lógica de linking aparece em múltiplos lugares
- **Fix**: Centralizar em ConsultantLinkingService

### 16. `any` em Validators
- **File**: `src/validators/paymentValidator.ts` (linhas ~31, 37, 43, 49, 61)
- **Code**: `{ req }: any`
- **Issue**: Reduz type safety

## Baixa Prioridade

### 17. Sem Soft Deletes
- **Issue**: Nenhum campo `deletedAt` nos models — registros deletados são permanentemente removidos sem trilha de auditoria

### 18. Sem Rastreamento de Autor em Entidades Financeiras
- **Issue**: Campos `createdBy`/`updatedBy` ausentes em `Payment` e `Debt`

### 19. Rate Limiter: Parsing Frágil de Env Vars
- **File**: `src/middlewares/rateLimitMiddleware.ts` (linhas ~9-10)
- **Code**: `parseInt(process.env.RATE_LIMIT_WINDOW_MS || '') || 5 * 60 * 1000`
- **Issue**: Se parse falha retorna NaN; melhorar validação explícita

### 20. Stack Trace Exposto em Dev
- **File**: `src/middlewares/errorHandler.ts` (linhas ~87-90)
- **Issue**: Em `NODE_ENV=development`, stack trace completo retornado ao cliente — pode expor paths do sistema

### 21. Dependências Ausentes
- Sem biblioteca de logging (Winston, Pino)
- Sem schema validation library (Zod, Yup) — dependência apenas de express-validator

## Segurança — Checklist

| Controle | Status |
|---|---|
| SQL Injection | ✓ Protegido via Prisma |
| Autenticação JWT | ✓ Implementado (fraco fallback — ver #2) |
| Rate Limiting | ✓ Implementado (config parcial) |
| Helmet headers | ✓ |
| bcrypt hashing | ✓ 10 rounds (poderia ser 12+) |
| CORS | ⚠ Muito permissivo (`*`) |
| Callback validation | ✗ CRÍTICO — opcional |
| Input validation | ⚠ Parcial — type assertions bypassam |
| Logging financeiro | ✗ Ausente |
| CSRF | ❓ Não verificado |

---
*Gerado em: mapeamento inicial do codebase*
