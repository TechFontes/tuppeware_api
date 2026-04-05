# Escopo do Projeto Tuppeware

## Visão do Produto

O Tuppeware é uma API REST backend para gestão de débitos e pagamentos de uma rede de consultoras. O sistema permite que consultoras visualizem seus débitos pendentes conforme sua posição na hierarquia da rede, efetuem pagamentos via PIX ou cartão de crédito, e que administradores importem e gerenciem dados.

## Contexto de Negócio

A rede é estruturada em quatro níveis hierárquicos:

| Role | Visibilidade de Débitos |
|---|---|
| ADMIN | Todos os débitos do sistema |
| GERENTE | Todos os débitos do sistema (mesma visibilidade que ADMIN, com filtros por grupo/distrito) |
| EMPRESARIA | Débitos do seu distrito |
| LIDER | Débitos do seu grupo |
| CONSULTOR | Débitos vinculados ao seu código de consultora |

A relação entre `User` e `Consultant` é feita via CPF. O JWT não carrega CPF — o serviço busca o `Consultant` pelo CPF do usuário autenticado.

## Gateway de Pagamento

**eRede** (REST JSON, autenticação Basic Auth com PV + Integration Key).

- PIX: payload `kind: "pix"` com `expirationDate`
- Cartão de crédito: payload `kind: "credit"` com dados de cartão e billing
- Valor enviado em **centavos** (inteiro)
- Callbacks assíncronos para atualização de status

## Limites do Sistema

**Dentro do escopo:**
- API REST backend (Node.js/TypeScript/Express 5)
- Autenticação e autorização por JWT + roles
- Gestão de débitos com hierarquia de visibilidade
- Pagamentos via eRede (PIX e cartão de crédito)
- Importação de dados via CSV (débitos e consultoras)
- Notificações em tempo real via Socket.IO
- Tokenização de cartões para reuso

**Fora do escopo:**
- Frontend / interface de usuário
- Relatórios e dashboards
- Integração com outros gateways de pagamento
- Gestão financeira além dos débitos importados

## Stack Técnica

- **Runtime:** Node.js + TypeScript
- **Framework HTTP:** Express 5
- **ORM:** Prisma com adapter MariaDB (`generated/prisma/`)
- **Banco de dados:** MariaDB/MySQL
- **Real-time:** Socket.IO
- **Testes:** Vitest (unit + integration)
- **Docs API:** Swagger UI em `/api/docs`
