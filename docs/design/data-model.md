# Modelo de Dados — Tuppeware

## Entidades

### User
Usuário do sistema (consultora, líder, admin etc).

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| name | String | Nome completo |
| cpf | String (unique) | CPF sem formatação |
| email | String (unique) | E-mail de acesso |
| password | String | Hash bcrypt |
| role | UserRole | Papel na hierarquia |
| isActive | Boolean | Conta ativa/inativa |
| phone | String? | Telefone opcional |
| birthDate | DateTime? | Data de nascimento |
| address, addressNumber, ... | String? | Campos de endereço opcionais |

### Consultant
Dados hierárquicos de uma consultora importados via CSV.

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| codigo | String (unique) | Código da consultora na rede |
| tipo | Int | 1=Empresária, 2=Líder, 3=Consultor |
| grupo | String | Grupo ao qual pertence |
| distrito | String | Distrito ao qual pertence |
| cpf | String (unique) | CPF — chave de vínculo com User |
| userId | String? (unique) | FK para User (opcional) |

### Debt
Débito importado via CSV.

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| codigo | String | Código da consultora devedora |
| nome | String | Nome da consultora |
| grupo | String | Grupo do débito |
| distrito | String | Distrito do débito |
| semana | String | Identificador de semana do pedido |
| valor | Decimal(10,2) | Valor do débito em reais |
| diasAtraso | Int | Dias de atraso no vencimento |
| dataVencimento | DateTime | Data de vencimento |
| numeroNf | String (unique) | Número da nota fiscal |
| status | DebtStatus | PENDENTE, ATRASADO, PAGO |

### Payment
Transação de pagamento criada pelo usuário.

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| userId | String | FK para User |
| method | PaymentMethod | PIX ou CARTAO_CREDITO |
| installments | Int | Número de parcelas (padrão 1) |
| subtotal | Decimal(10,2) | Soma dos débitos sem fee |
| fee | Decimal(10,2) | Taxa aplicada (5% para cartão) |
| totalValue | Decimal(10,2) | subtotal + fee |
| status | PaymentStatus | PENDENTE, PAGO, CANCELADO |
| gatewayProvider | GatewayProvider | EREDE |
| referenceNum | String? (unique) | TPW-{ts}-{userId[0:8]} |
| gatewayTransactionId | String? | TID retornado pela eRede |
| gatewayOrderId | String? | NSU retornado pela eRede |
| gatewayStatusCode | String? | returnCode da eRede |
| gatewayStatusMessage | String? | returnMessage da eRede |
| processorReference | String? | authorizationCode da eRede |
| paymentLink | String? (Text) | URL do QR Code PIX |
| qrCode | String? (Text) | String EMV (copia e cola) |
| callbackPayload | Json? | Payload bruto do callback |

### PaymentDebt
Tabela pivot: quais débitos foram incluídos em um pagamento.

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| paymentId | String | FK para Payment |
| debtId | String | FK para Debt |

Constraint única: `(paymentId, debtId)`.

### PasswordReset
Token de reset de senha com expiração.

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| userId | String | FK para User |
| token | String (unique) | Token opaco gerado |
| expiresAt | DateTime | Expiração (1h após criação) |
| used | Boolean | Se já foi utilizado |

### SavedCard
Cartão tokenizado pelo gateway para reuso.

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| userId | String | FK para User |
| token | String (unique) | Token opaco da eRede |
| cardBrand | String? | Bandeira (VISA, MASTER...) |
| lastFour | String | Últimos 4 dígitos |
| holderName | String | Nome no cartão |

### Setting
Configurações chave-valor do sistema.

| Campo | Tipo | Descrição |
|---|---|---|
| key | String (PK) | Identificador da configuração |
| value | String | Valor |

**Chaves conhecidas:**
- `max_active_payment_links` — limite de links PIX pendentes por usuário (padrão: 5)

---

## Enums

```
UserRole:      ADMIN | GERENTE | EMPRESARIA | LIDER | CONSULTOR
DebtStatus:    PENDENTE | ATRASADO | PAGO
PaymentMethod: PIX | CARTAO_CREDITO
PaymentStatus: PENDENTE | PAGO | CANCELADO
GatewayProvider: EREDE
```

---

## Relacionamentos

```
User ──1:1── Consultant       (via userId em Consultant)
User ──1:N── Payment
User ──1:N── PasswordReset
User ──1:N── SavedCard
Payment ──N:M── Debt          (via PaymentDebt)
```

---

## Regras de integridade

- `numeroNf` é único — importações de CSV com NF duplicada são rejeitadas por linha
- Um `Debt` pode aparecer em múltiplos Payments, mas apenas um pode estar `PAGO`
- Um `User` pode ter no máximo `max_active_payment_links` Payments com status `PENDENTE`
- `Consultant.cpf` e `User.cpf` devem ser o mesmo valor para o vínculo funcionar
