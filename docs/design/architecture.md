# Arquitetura do Tuppeware

## Camadas

```
HTTP Request
    ↓
Route (express Router)
    — declara verbos, aplica middlewares e validators
    ↓
authMiddleware
    — verifica JWT Bearer, popula req.user = { id, role, email, cpf }
    ↓
roleMiddleware(...allowedRoles)
    — verifica se req.user.role está na lista; lança 403 se não
    ↓
validationMiddleware
    — executa express-validator; retorna 422 com erros se inválido
    ↓
Controller
    — extrai params de req, chama Service, devolve res.json()
    — NÃO contém lógica de negócio
    ↓
Service
    — orquestra repositórios, aplica regras de negócio, lança AppError
    — NÃO acessa req/res
    ↓
Repository
    — único ponto de acesso ao banco via Prisma
    — NÃO contém lógica de negócio
    ↓
Prisma Client (generated/prisma/)
    ↓
MariaDB
```

**Regras de fronteira:**
- `req`/`res` não desce além do Controller
- Queries Prisma não sobem além do Repository
- Services não importam outros Controllers
- Todos os erros lançados são `AppError`; o `errorHandler` em `app.ts` os captura

---

## Rotas disponíveis (base: `/api`)

| Prefixo | Arquivo | Autenticação |
|---|---|---|
| `/auth` | authRoutes.ts | Parcial (login/reset são públicas) |
| `/debts` | debtRoutes.ts | JWT obrigatório |
| `/payments` | paymentRoutes.ts | JWT obrigatório |
| `/payment-history` | paymentHistoryRoutes.ts | JWT obrigatório |
| `/admin` | adminRoutes.ts | JWT + role ADMIN |
| `/users` | userRoutes.ts | JWT obrigatório |
| `/api/docs` | Swagger UI | Público |
| `/health` | inline em app.ts | Público |

---

## Hierarquia de visibilidade de débitos

Implementada em `DebtService._buildWhereClause`:

```
ADMIN       → sem filtro (vê todos)
GERENTE     → sem filtro (tratado como ADMIN até implementação específica)
EMPRESARIA  → where.distrito = consultant.distrito
LIDER       → where.grupo = consultant.grupo
CONSULTOR   → where.codigo = consultant.codigo
```

O CPF não está no JWT. O Service busca o `Consultant` pelo `req.user.cpf` (populado pelo authMiddleware).

---

## Fluxo de pagamento

### Criação (POST /api/payments)

1. Buscar débitos por IDs — validar existência e que nenhum está `PAGO`
2. Calcular `subtotal` (soma dos valores)
3. Se CARTAO_CREDITO: aplicar fee 5% → `totalValue = subtotal * 1.05`
4. Validar regras de parcelamento (ver RF-14)
5. Verificar limite de links ativos (`settings.max_active_payment_links`, padrão 5)
6. Gerar `referenceNum = TPW-{Date.now()}-{userId[0:8]}`
7. Converter para centavos: `Math.round(totalValue * 100)`
8. Montar payload eRede via `ERedeService.buildPixPayload` ou `buildCreditPayload`
9. Chamar `ERedeService.createTransaction` (POST para eRede)
10. Salvar pagamento no banco com status inicial
11. `updateStatusByGatewayCode` → mapear `returnCode` → `PAGO/PENDENTE/CANCELADO`
12. Se CARTAO + `saveCard` + aprovado: tokenizar cartão (falha silenciosa)
13. Emitir `payment:created` via WebSocket
14. Retornar payment + `checkoutUrl` + `qrCode`

### Callback (POST /api/payments/callback)

1. `ERedeService.validateCallbackSignature` — valida estrutura mínima
2. Buscar payment por `tid` ou `reference`
3. Mapear `returnCode` + `status` → status local
4. Checar idempotência — se já está no mesmo estado, retornar sem update
5. Atualizar payment no banco
6. Se `PAGO`: atualizar débitos vinculados para `PAGO`
7. Emitir `payment:updated` via WebSocket

---

## WebSocket

`WebSocketService` encapsula Socket.IO. Cada usuário entra em uma sala identificada por seu `userId`. Eventos emitidos:

| Evento | Quando |
|---|---|
| `payment:created` | Após `PaymentService.create` |
| `payment:updated` | Após `PaymentService.processGatewayCallback` ou `updateStatus` |

---

## Rate Limiting

Aplicado nas rotas de criação de pagamento: **5 req / 5 min** por IP. Configurável via `RATE_LIMIT_WINDOW_MS` e `RATE_LIMIT_MAX_REQUESTS`.

---

## Mapeamento de status eRede → local

| returnCode | webhookStatus | Status local |
|---|---|---|
| `"00"` | qualquer | `PAGO` |
| qualquer | `0` | `PAGO` |
| qualquer | `3` | `PENDENTE` |
| qualquer | `4` | `CANCELADO` |
| outros | outros | `CANCELADO` |
