# Critérios de Aceitação — Tuppeware

Rastreabilidade: cada critério referencia o(s) requisito(s) que valida.

---

## Auth (RF-01, RF-02, RF-03)

| # | Critério | Requisitos |
|---|---|---|
| AC-01 | Login com CPF + senha válidos retorna 200 com `token` e dados do usuário | RF-01 |
| AC-02 | Login com senha incorreta retorna 401 | RF-01 |
| AC-03 | Login com CPF inexistente retorna 401 | RF-01 |
| AC-04 | Rota protegida sem token retorna 403 | RF-01 |
| AC-05 | Rota protegida com token expirado retorna 401 | RF-01 |
| AC-06 | Reset de senha envia e-mail com token; token expira em 1h | RF-02 |
| AC-07 | Token de reset usado duas vezes retorna erro na segunda tentativa | RF-02 |
| AC-08 | Usuário inativo não consegue autenticar | RF-04 |

---

## Usuários (RF-04, RF-05)

| # | Critério | Requisitos |
|---|---|---|
| AC-09 | Admin cria usuário com role válida; retorna 201 com dados do usuário | RF-04 |
| AC-10 | CPF inválido retorna 422 | RF-05 |
| AC-11 | CPF duplicado retorna 409 | RF-05 |
| AC-12 | Não-admin não pode criar usuários; retorna 403 | RF-04 |

---

## Débitos (RF-06 a RF-10)

| # | Critério | Requisitos |
|---|---|---|
| AC-13 | ADMIN recebe débitos de todos os distritos e grupos | RF-08 |
| AC-14 | EMPRESARIA recebe apenas débitos do seu distrito | RF-08 |
| AC-15 | LIDER recebe apenas débitos do seu grupo | RF-08 |
| AC-16 | CONSULTOR recebe apenas débitos vinculados ao seu código | RF-08 |
| AC-17 | Consultora sem registro em `consultants` recebe 403 | RF-10 |
| AC-18 | Filtro por `status` retorna apenas débitos com aquele status | RF-06 |
| AC-19 | Filtro por `dataVencimentoInicio` e `dataVencimentoFim` retorna intervalo correto | RF-06 |
| AC-20 | Filtro por `valorMin` e `valorMax` retorna intervalo correto | RF-06 |
| AC-21 | Paginação retorna `page`, `limit`, `total`, `data` com valores corretos | RF-07 |
| AC-22 | Ordenação por `diasAtraso desc` retorna débito mais atrasado primeiro | RF-09 |

---

## Pagamentos (RF-11 a RF-21)

| # | Critério | Requisitos |
|---|---|---|
| AC-23 | Pagamento PIX retorna `checkoutUrl` e `qrCode` não-vazios | RF-11 |
| AC-24 | Pagamento com cartão aplica fee de 5%: `totalValue = subtotal * 1.05` | RF-13 |
| AC-25 | Subtotal < R$300 com `installments > 1` retorna 400 | RF-14 |
| AC-26 | Subtotal R$300–R$499,99 com `installments > 2` retorna 400 | RF-14 |
| AC-27 | Subtotal ≥ R$500 com `installments > 3` retorna 400 | RF-14 |
| AC-28 | Subtotal ≥ R$500 com `installments = 3` é aceito | RF-14 |
| AC-29 | Débito com status `PAGO` incluído na seleção retorna 400 | RF-15 |
| AC-30 | Débito inexistente na seleção retorna 400 | RF-15 |
| AC-31 | Usuário com 5 links ativos (configuração padrão) não cria novo pagamento; retorna 429 | RF-16 |
| AC-32 | `referenceNum` gerado segue formato `TPW-{timestamp}-{userId[0:8]}` | RF-17 |
| AC-33 | Callback com `returnCode "00"` marca pagamento como `PAGO` e débitos vinculados como `PAGO` | RF-18 |
| AC-34 | Callback com `status 3` marca pagamento como `PENDENTE` | RF-18 |
| AC-35 | Callback com `status 4` marca pagamento como `CANCELADO` | RF-18 |
| AC-36 | Callback repetido com mesmo `returnCode` e mesmo `status` não gera update redundante | RF-19 |
| AC-37 | Reabrir PIX criado hoje com link ativo retorna link existente sem nova transação eRede | RF-20 |
| AC-38 | Reabrir pagamento com cartão expirado retorna 400 | RF-20 |
| AC-39 | Reabrir pagamento com status diferente de `PENDENTE` retorna 400 | RF-20 |
| AC-40 | Cartão salvo com `saveCard: true` após pagamento aprovado aparece em `GET /users/me/cards` | RF-21 |
| AC-41 | Falha na tokenização não impede retorno do pagamento aprovado | RF-10 (RNF) |

---

## Admin (RF-22 a RF-25)

| # | Critério | Requisitos |
|---|---|---|
| AC-42 | CSV de débitos com todas as linhas válidas importa todos os registros | RF-22 |
| AC-43 | CSV de débitos com uma linha inválida reporta o erro dessa linha e importa as demais | RF-24 |
| AC-44 | CSV de consultoras vincula `codigo` ao registro de consultor existente | RF-23 |
| AC-45 | Admin atualiza status de pagamento para `PAGO`; débitos vinculados também ficam `PAGO` | RF-25 |
| AC-46 | Não-admin não pode importar CSV; retorna 403 | RF-22 |

---

## WebSocket (RF-26, RF-27)

| # | Critério | Requisitos |
|---|---|---|
| AC-47 | Após criação de pagamento, evento `payment:created` é emitido na sala `userId` | RF-26 |
| AC-48 | Após callback atualizar status, evento `payment:updated` é emitido na sala `userId` | RF-27 |
