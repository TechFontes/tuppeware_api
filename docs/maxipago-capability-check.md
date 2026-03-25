# MaxiPago Capability Check (Sandbox)

Este documento registra o levantamento de capacidades para a integracao MaxiPago no contexto atual.

## Fontes usadas

- PDF enviado: `Integração-via-API-Transactions-Requests-com-Rede-Pay.pdf`
- Endpoint sandbox informado no PDF: `https://testapi.maxipago.net/UniversalAPI/postXML`
- Credenciais sandbox fornecidas pelo time de negocio (nao versionadas aqui)

## Capacidades identificadas

- **Fluxo transacional XML** via `transaction-request` e retorno `transaction-response`.
- **Codigos de retorno** principais:
  - `0` aprovado
  - `1` negado
  - `2` negado por duplicidade/fraude
  - `5` em revisao
  - `1022`, `1024`, `1025`, `2048`, `4097` erros
- **Callback assincrono** com campos `hp_*` (incluindo `hp_responsecode`, `hp_transid`, `hp_refnum`).

## Pontos de atencao (documentacao possivelmente antiga)

- O PDF descreve fortemente um fluxo com `authenticationURL` (redirecionamento).
- A estrategia de **captura direta de cartao** deve ser validada em homologacao com suporte MaxiPago.
- O campo `hp_signature_response` exige alinhamento de algoritmo/assinatua com suporte para producao.

## Decisoes aplicadas no projeto

- Integracao implementada com:
  - tentativa de fluxo direto no envio de `sale`;
  - suporte a callback com validacao de assinatura HMAC SHA-256 canonica;
  - mapeamento de status do gateway para status interno.

## Checklist de homologacao obrigatoria

1. Confirmar com MaxiPago o formato oficial da assinatura de callback.
2. Validar cenario de aprovado (`responseCode=0`).
3. Validar cenario de pendente/revisao (`responseCode=5/6`).
4. Validar erro de credencial (`responseCode=1025`).
5. Validar idempotencia de callbacks repetidos.
