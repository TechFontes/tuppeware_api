## 🎯 Visão Geral

O **Portal de Gestão de Débitos e Pagamentos** é uma plataforma web desenvolvida para gerenciar débitos financeiros e facilitar o processo de pagamento através de links de pagamento automatizados. O sistema oferece uma estrutura hierárquica de acesso aos dados, garantindo que cada usuário visualize apenas as informações pertinentes ao seu nível de responsabilidade.

---

## 👥 Tipos de Usuários e Hierarquia

O sistema possui três níveis hierárquicos de usuários, cada um com diferentes permissões de visualização:

### 1. **Empresária** (Nível mais alto)
- Visualiza todos os débitos de um **distrito** completo
- Possui visão estratégica de toda a região sob sua responsabilidade
- Identifica-se pela badge roxa no sistema

### 2. **Líder** (Nível intermediário)
- Visualiza todos os débitos de um **grupo** específico
- Gerencia uma equipe de consultores
- Identifica-se pela badge azul no sistema

### 3. **Consultor** (Nível operacional)
- Visualiza apenas seus **próprios débitos**
- Responsável direto pelos pagamentos
- Identifica-se pela badge verde no sistema

### 4. **Administrador**
- Acesso completo ao sistema
- Gerencia importação de dados
- Não possui restrições de visualização

---

## 🔐 Sistema de Autenticação

### Cadastro de Usuários
Os novos usuários devem se registrar fornecendo:
- **Nome completo**
- **CPF** (validado automaticamente)
- **E-mail** (usado para login)
- **Senha** (mínimo de 6 caracteres)

### Login
- Acesso realizado através de **e-mail e senha**
- Sistema com confirmação automática de e-mail (sem necessidade de verificação)

### Recuperação de Senha
- Processo completo de recuperação via e-mail
- Link de redefinição enviado automaticamente
- Usuário define nova senha através de página segura

---

## 💰 Gestão de Débitos

### Visualização de Débitos

O painel principal exibe uma lista completa de débitos pendentes com as seguintes informações:

- **Nome do devedor**
- **Número da Nota Fiscal (NF)**
- **Valor do documento**
- **Data de vencimento**
- **Dias de atraso** (calculado automaticamente)
- **Status do débito** (Pendente, Atrasado ou Pago)
- **Grupo e Distrito** (organização territorial)
- **Semana do documento**

### Funcionalidades de Filtros

O sistema oferece múltiplas opções de filtros para facilitar a busca:

- **Busca por texto livre**: Nome ou número da NF
- **Filtro por grupo**
- **Filtro por distrito**
- **Filtro por data de vencimento**
- **Filtro por faixa de valor** (mínimo e máximo)

### Organização e Ordenação

Os débitos podem ser ordenados por:
- Nome do devedor
- Valor do documento
- Data de vencimento
- Status do pagamento

A ordenação pode ser crescente ou decrescente.

---

## 💳 Sistema de Pagamentos

### Seleção de Débitos

- O usuário pode **selecionar múltiplos débitos** para pagamento conjunto
- Checkboxes individuais para cada débito
- Contador de débitos selecionados em tempo real
- Cálculo automático do valor total

### Métodos de Pagamento

O sistema oferece duas modalidades:

#### 1. **PIX**
- Pagamento à vista
- Sem taxas adicionais
- Pagamento em parcela única

#### 2. **Cartão de Crédito**
- **Taxa de 5%** sobre o valor total
- Possibilidade de **parcelamento**:
  - Valores abaixo de R$ 300: apenas à vista
  - Valores entre R$ 300 e R$ 499,99: até 2 parcelas
  - Valores a partir de R$ 500: até 3 parcelas

### Geração de Link de Pagamento (Asaas)

Ao confirmar o pagamento:

1. Sistema gera automaticamente um **link de pagamento** seguro
2. Link é aberto em nova aba do navegador
3. O pagamento é registrado no histórico
4. Status fica como "Pendente" até confirmação

### Proteção contra Abuso

- **Limite de requisições**: máximo de 5 links de pagamento por usuário a cada 5 minutos
- Mensagem clara quando o limite é atingido

---

## 📊 Histórico de Pagamentos

### Visualização do Histórico

Página dedicada onde o usuário pode:

- Ver todos os pagamentos realizados
- Filtrar por status (Todos, Pendente, Pago, Cancelado)
- Buscar por número da NF ou valor
- Visualizar data de criação
- Ver método de pagamento utilizado
- Acompanhar número de parcelas

### Informações Detalhadas

Cada pagamento exibe:
- Data e hora da criação
- Valor total (incluindo taxas)
- Quantidade de parcelas
- Status atualizado em tempo real
- Link de pagamento (pode ser copiado novamente)

### Atualização em Tempo Real

- O status dos pagamentos é atualizado automaticamente
- Sem necessidade de recarregar a página
- Notificações visuais de mudanças de status

---

## ⚙️ Painel Administrativo

### Acesso Restrito

- Apenas usuários com perfil de **Administrador** têm acesso
- Identificado pelo botão "Admin" no cabeçalho

### Importação de consultores

Essa informação é usada para vincular os usuários cadastrados a um código interno, grupo e distrito. Precisa ser atualizado sempre quer for importado, pois consultores podem se movimentar entre grupos e distritos.

O administrador pode importar o consultores em lote através de arquivo CSV:

**Formato do arquivo:**
```
codigo;tipo;grupo;distrito;CPF
```

**Regras:**
- Tipos: 1 (Empresária), 2 (Líder), 3 (Consultor)

### Importação de Débitos

O administrador pode atualizar a base de débitos através de arquivo CSV:

**Formato do arquivo:**
```
codigo;nome;grupo;distrito;semana;valor;dias_atraso;data_vencimento;numero_nf
```


---

## 🎨 Interface e Experiência do Usuário

### Dashboard Principal

- **Cards informativos** no topo:
  - Total de débitos disponíveis
  - Quantidade selecionada
  - Valor total a pagar

- **Identificação visual** clara:
  - Nome e código do usuário
  - Badge colorida indicando tipo de perfil
  - Botões de acesso rápido

### Navegação

- Botão de acesso ao **Histórico de Pagamentos**
- Botão de acesso ao **Painel Admin** (quando aplicável)
- Botão de **Logout** sempre visível

### Feedback Visual

- **Badges de status coloridas**:
  - Verde: Pago ✓
  - Vermelho: Atrasado ⚠️
  - Amarelo: Pendente ⏰

- **Notificações toast**: 
  - Confirmações de sucesso
  - Alertas de erro
  - Informações importantes

### Paginação

- Sistema automático de paginação
- 10 itens por página
- Navegação fácil entre páginas
- Indicador de página atual

---

## 🔒 Segurança e Regras de Negócio

### Proteção de Dados

- **Tokens de sessão** seguros
- **Controle de acesso** baseado em hierarquia
- Cada usuário vê apenas dados autorizados

### Validações

- CPF validado no formato brasileiro
- E-mails validados no formato correto
- Valores monetários sempre positivos
- Datas no formato padrão

### Integridade de Dados

- Débitos vinculados a usuários existentes
- Pagamentos rastreados por IDs únicos
- Histórico completo de transações
- Atualização de status via webhook (futuro)

---

## 📱 Responsividade

O sistema é **totalmente responsivo**, funcionando perfeitamente em:
- Computadores desktop
- Tablets
- Smartphones
- Diferentes navegadores

---

## 🔄 Fluxo Operacional Típico

### Para Consultores:

1. Login no sistema
2. Visualização dos débitos pessoais
3. Seleção dos débitos a pagar
4. Escolha do método de pagamento
5. Geração e acesso ao link de pagamento
6. Acompanhamento no histórico

### Para Líderes e Empresárias:

1. Login no sistema
2. Visão ampla de débitos do grupo/distrito
3. Uso de filtros para análise específica
4. Acompanhamento de pagamentos realizados
5. Gestão estratégica da carteira

OBS: Elas podem escolher pagar os débitos do seu grupo/distrito.
### Para Administradores:

1. Acesso ao painel administrativo
2. Importação periódica de usuários novos
3. Atualização da base de débitos
4. Monitoramento geral do sistema

---
