# Requisitos do Projeto Tuppeware

## Requisitos Funcionais

### Autenticação e Usuários

| # | Descrição |
|---|---|
| RF-01 | O sistema deve autenticar usuários via CPF + senha, retornando JWT |
| RF-02 | O sistema deve permitir reset de senha via e-mail com token temporário (expiração: 1h) |
| RF-03 | O sistema deve suportar os roles: `ADMIN`, `GERENTE`, `EMPRESARIA`, `LIDER`, `CONSULTOR` |
| RF-04 | O sistema deve permitir que administradores criem, atualizem e desativem usuários |
| RF-05 | O sistema deve validar CPF antes de criar ou autenticar um usuário |

### Débitos

| # | Descrição |
|---|---|
| RF-06 | O sistema deve listar débitos com filtros de status, grupo, distrito, data de vencimento e valor |
| RF-07 | O sistema deve paginar resultados de débitos com `page`, `limit`, `total` e `data` |
| RF-08 | O sistema deve aplicar hierarquia de visibilidade: ADMIN→todos, EMPRESARIA→distrito, LIDER→grupo, CONSULTOR→código |
| RF-09 | O sistema deve ordenar débitos por `nome`, `valor`, `dataVencimento`, `status`, `diasAtraso` |
| RF-10 | O sistema deve retornar 403 para consultora sem vínculo na tabela `consultants` |

### Pagamentos

| # | Descrição |
|---|---|
| RF-11 | O sistema deve criar pagamentos via PIX pelo gateway eRede, retornando `checkoutUrl` e `qrCode` |
| RF-12 | O sistema deve criar pagamentos via cartão de crédito pelo gateway eRede |
| RF-13 | O sistema deve aplicar fee de 5% sobre o subtotal em pagamentos com cartão de crédito |
| RF-14 | O sistema deve aplicar regras de parcelamento: subtotal < R$300 → 1x; R$300–R$499,99 → máx 2x; ≥R$500 → máx 3x |
| RF-15 | O sistema deve rejeitar pagamentos que incluam débitos já pagos |
| RF-16 | O sistema deve rejeitar pagamentos se o usuário atingiu o limite configurável de links ativos |
| RF-17 | O sistema deve gerar `referenceNum` no formato `TPW-{timestamp}-{userId[0:8]}` |
| RF-18 | O sistema deve processar callbacks assíncronos da eRede e atualizar status de pagamento e débitos |
| RF-19 | O processamento de callback deve ser idempotente (sem double-update para mesmo estado) |
| RF-20 | O sistema deve permitir reabrir pagamento pendente: reutiliza link PIX do dia ou cria nova transação |
| RF-21 | O sistema deve tokenizar e armazenar cartão quando `saveCard: true` e pagamento aprovado |

### Admin

| # | Descrição |
|---|---|
| RF-22 | O sistema deve importar débitos via CSV com delimitador `;` e formato definido |
| RF-23 | O sistema deve importar consultoras via CSV com delimitador `;` e formato definido |
| RF-24 | Erros em linhas individuais do CSV não devem abortar a importação inteira |
| RF-25 | O sistema deve permitir que admin atualize status de pagamento manualmente |

### Real-time

| # | Descrição |
|---|---|
| RF-26 | O sistema deve emitir evento `payment:created` via WebSocket na sala do usuário após criação de pagamento |
| RF-27 | O sistema deve emitir evento `payment:updated` via WebSocket após callback atualizar status |

---

## Requisitos Não-Funcionais

### Segurança

| # | Descrição |
|---|---|
| RNF-01 | Senhas devem ser armazenadas com hash bcrypt |
| RNF-02 | JWT deve ser assinado com `JWT_SECRET` configurável via variável de ambiente |
| RNF-03 | Rate limit de 5 requisições por 5 minutos em rotas de criação de pagamento |
| RNF-04 | Headers de segurança via Helmet |
| RNF-05 | CORS configurado |
| RNF-06 | CPF não deve ser incluído no payload do JWT |

### Confiabilidade

| # | Descrição |
|---|---|
| RNF-07 | Todos os erros de negócio devem ser propagados via `AppError` com status HTTP correto |
| RNF-08 | `errorHandler` centralizado deve ser o último middleware em `app.ts` |
| RNF-09 | Timeout de comunicação com a eRede configurável via `EREDE_TIMEOUT_MS` |
| RNF-10 | Falha na tokenização de cartão não deve interromper o fluxo de pagamento |

### Manutenibilidade

| # | Descrição |
|---|---|
| RNF-11 | Arquitetura em camadas: Route → Controller → Service → Repository; sem lógica de negócio nos controllers |
| RNF-12 | Tipos e enums do Prisma devem ser importados via `src/types/index.ts`, não diretamente de `generated/prisma/` |
| RNF-13 | Após qualquer alteração em `prisma/schema.prisma`, executar `prisma:generate` antes de rodar o app |

### Testabilidade

| # | Descrição |
|---|---|
| RNF-14 | Unit tests com Vitest com mocks para repositórios e serviços externos |
| RNF-15 | Integration tests com banco MariaDB real (não mock de banco) |
| RNF-16 | Scripts separados: `npm test` para unit, `npm run test:integration` para integration |

### Observabilidade

| # | Descrição |
|---|---|
| RNF-17 | Logs HTTP via Morgan em todas as requisições |
| RNF-18 | Documentação Swagger UI disponível em `/api/docs` |

### Compatibilidade de API

| # | Descrição |
|---|---|
| RNF-19 | Os modelos de input (body, params, query) e output (response shape) das rotas já existentes não devem ser alterados, salvo necessidade estritamente justificada por um requisito funcional ou correção de bug crítico. O frontend está em desenvolvimento ativo contra essas rotas. |
| RNF-20 | Qualquer alteração de contrato em rota existente deve ser explicitamente comunicada e aprovada antes de ser implementada. |

---

## Formatos CSV

**Débitos:** `codigo;nome;grupo;distrito;semana;valor;dias_atraso;data_vencimento;numero_nf`

**Consultoras:** `codigo;tipo;grupo;distrito;CPF`
