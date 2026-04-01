# Design Doc — Documentação e TDD do Projeto Tuppeware

**Data:** 2026-04-01  
**Autor:** carlos.ferreira  
**Status:** Aprovado

---

## Contexto

O projeto Tuppeware é uma API de gestão de débitos e pagamentos para rede de consultoras. O projeto foi desenvolvido sem testes automatizados e com documentação desatualizada (referências ao gateway MaxiPago, role GERENTE ausente). Este design doc define a estratégia para documentar o projeto do zero e introduzir TDD de forma retroativa e prospectiva.

---

## Objetivo

1. Criar documentação estruturada e versionada no repositório: escopo, requisitos, critérios de aceitação, design docs
2. Atualizar o CLAUDE.md para refletir o estado real do código e carregar contexto automaticamente em cada sessão
3. Introduzir TDD como regra inviolável para todo código a partir de agora
4. Configurar Vitest para unit tests e integration tests
5. Criar plano de auditoria do código atual contra os requisitos documentados

---

## Decisões

| Decisão | Escolha | Razão |
|---|---|---|
| Framework de testes | Vitest | TypeScript nativo, rápido, API compatível com Jest |
| Escopo de testes | Unit + Integration | Lógica financeira crítica + fluxo completo de pagamento |
| Localização dos docs | `docs/` no repo | Versionado, rastreável por git, carregado no CLAUDE.md |
| Abordagem de documentação | Docs primeiro, testes depois | Visão completa antes de escrever specs executáveis |
| Fonte de verdade | Código atual | CLAUDE.md e todos os docs refletem eRede, roles reais |

---

## Estrutura de Arquivos

```
docs/
  project/
    scope.md           ← visão do produto, contexto, papéis, limites
    requirements.md    ← RF-01..N + RNF-01..N
    acceptance.md      ← critérios de aceite por feature
  design/
    architecture.md    ← camadas, fluxo de pagamento, hierarquia
    gateway-erede.md   ← contrato eRede: endpoints, payloads, códigos
    data-model.md      ← entidades, relacionamentos, enums
  superpowers/
    specs/             ← design docs deste processo
src/
  __tests__/
    unit/
      services/        ← PaymentService, DebtService, ERedeService, AuthService
      utils/           ← pagination, cpfValidator
    integration/       ← endpoints HTTP + banco MariaDB de teste
vitest.config.ts
vitest.integration.config.ts
```

---

## Regra TDD

Inserida no CLAUDE.md de forma explícita e restritiva. Ver seção `## TDD — REGRA INVIOLÁVEL` no CLAUDE.md.

Ordem obrigatória: **RED → GREEN → REFACTOR**. Sem exceções.

---

## Próximos Passos

Ver plano de implementação gerado pelo skill `writing-plans`.
