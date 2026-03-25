# Tuppeware API

API backend para gestão de débitos e pagamentos.

## Gateway de pagamento (MaxiPago)

A integração de pagamentos foi adaptada para uso da MaxiPago com:

- criação de transação no `POST /api/payments`
- callback assíncrono no `POST /api/payments/callback/maxipago`
- mapeamento de status do gateway para status interno do pagamento
- atualização automática de débitos para `PAGO` quando a transação é confirmada

Detalhes de levantamento técnico:

- [`docs/maxipago-capability-check.md`](docs/maxipago-capability-check.md)

## Variáveis de ambiente

Copie de `.env.example` e configure:

- `MAXIPAGO_MERCHANT_ID`
- `MAXIPAGO_MERCHANT_KEY`
- `MAXIPAGO_API_URL`
- `MAXIPAGO_PROCESSOR_ID`
- `MAXIPAGO_TIMEOUT_MS`
- `MAXIPAGO_CALLBACK_SECRET`
- `MAXIPAGO_SIGNATURE_ALGORITHM`

## Fluxo resumido

1. Cliente chama `POST /api/payments` com `debtIds`, `method`, `billing` e (se cartão) `card`.
2. API cria transação na MaxiPago e persiste metadados (`referenceNum`, `gatewayTransactionId`, etc.).
3. MaxiPago envia callback para atualizar status final.
4. API processa callback, atualiza pagamento e quita débitos vinculados quando aplicável.
