## 1. Módulo Admin  
  
### 1.1. Login  
  
**Alteração da Mensagem de Acesso:**  
  
* A mensagem padrão de solicitação de acesso deve ser alterada para "Entre em contato com a Distribuição para solicitar o acesso".  
  
### 1.2. Estrutura Organizacional  
  
**Funcionalidades de Filtragem:**  
  
* Implementar filtros na visualização da "estrutura organizacional" que permitam a segmentação por **distritos** e **grupos**.  
  
### 1.3. Importação de Débitos  
  
**Estrutura do CSV de Importação:**  
  
O arquivo CSV para importação de débitos deve seguir a seguinte estrutura:  

| Campo | Descrição |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| código | Código único do cliente |
| nome | Nome do cliente associado ao débito. |
| grupo | Grupo ao qual o cliente pertence. |
| distrito | Distrito ao qual o cliente pertence. |
| semana | Semana de referência do débito. |
| valor | Valor total do débito. |
| dataVencimento | Data de vencimento do débito (formato YYYY-MM-DD). |
| numeroNf | Número da Nota Fiscal associada ao débito. Este campo será utilizado como identificador único para atualização de débitos existentes. |
| status | Status atual do débito (e.g., Pendente, Pago, Atrasado). |
  
  
  
**Lógica de Importação:**  
  
* A funcionalidade de importação de débitos deve ser capaz de **atualizar débitos existentes** e **adicionar novos débitos**. A identificação para atualização será baseada no campo ==numeroNf==. Se um ==numeroNf== já existir no sistema, o débito correspondente será atualizado; caso contrário, um novo débito será criado.  
  
**Requisitos da Equipe Vitoriaware:**  
  
* **Listagem de Débitos Semanais:** Criar uma funcionalidade para gerar uma listagem detalhada dos débitos por semana.  
* **Listagem de Débitos Pagos no Dia:** Desenvolver uma listagem dos débitos que foram pagos no dia, com o objetivo de atualizar o site em tempo real ou em intervalos regulares.  
  
**Requisitos da Equipe de Desenvolvimento (Dev):**  
  
* **Endpoint para Inserção de Novos Débitos:** Criar um endpoint API dedicado para a inserção de novos débitos no sistema.  
* **Endpoint para Atualização de Status de Débitos:** Desenvolver um endpoint API para permitir a atualização do status de débitos existentes.  
  
### 1.4. Importação de Clientes  
  
**Estrutura do CSV de Importação:**  
  
O arquivo CSV para importação de clientes deve seguir a seguinte estrutura:  

| Campo    | Descrição                                              |
| -------- | ------------------------------------------------------ |
| USER     | Identificador único do usuário/cliente.                |
| name     | Nome completo do cliente.                              |
| cpf      | Cadastro de Pessoa Física do cliente.                  |
| email    | Endereço de e-mail do cliente.                         |
| role     | Perfil ou função do cliente no sistema.                |
| grupo    | Grupo ao qual o cliente será associado. Novo campo.    |
| distrito | Distrito ao qual o cliente será associado. Novo campo. |
  
  
**Lógica de Importação:**  
  
* A funcionalidade de importação de clientes deve permitir a **inserção de novos clientes** e a **atualização de informações de clientes existentes**. Para clientes existentes, a atualização deve ser restrita aos campos ==grupo== e ==distrito==.  
  
**Demandas da Equipe Vitoriaware:**  
  
* **Listagem Atualizada de Clientes:** Criar uma funcionalidade para gerar uma listagem atualizada de todos os clientes, incluindo os novos campos ==grupo== e ==distrito==.  
  
**Demandas da Equipe de Desenvolvimento (Dev):**  
  
* **Endpoint para Inserção de Novo Cliente:** Criar um endpoint API para a inserção de novos clientes.  
* **Endpoint para Atualização de Grupo e Distrito:** Desenvolver um endpoint API específico para a atualização dos campos ==grupo== e ==distrito== de clientes existentes.  
  
### 1.5. Gerenciamento de Usuários  
  
**Funcionalidade de Edição de Usuário:**  
  
* A ação de alterar um usuário deve permitir a modificação de **todas as informações cadastrais**, garantindo flexibilidade na gestão de perfis.  
  
**Exportação de Histórico de Vendas:**  
  
* Implementar a funcionalidade de **exportação do histórico de vendas** associado a cada usuário, permitindo análises e relatórios externos.  
  
**Desativação de Consultores:**  
  
* Em vez de exclusão, a funcionalidade para consultores deve ser a **desativação do perfil** ou a aplicação de um **soft delete**.  
  
### Hierarquia de usuários ADM  
  
* Criar funcionalidade onde o usuário “Gerente” define os níveis de acesso dos outros usuários com perfil “ADM” (Limita funcionalidades e acessos).  
  
  
### 1.6. Configurações do Perfil ADM  
  
* Inserir funcionalidade de criar usuários “ADM” e gerir o acesso deles (Serão os acessos da equipe da Distribuição)  
* Inserir funcionalidade de configurar limite de Links ativos por documento **(ver tópico 2.2.3)**  
  
### 1.7. Relatórios  
  
**Exportação de documentos pagos**  
  
* Implementar a funcionalidade de **exportação de documentos pagos**, contendo informações do cliente e do documento, a partir de filtros de data, grupo e distrito (será necessário para a baixa do documento no sistema interno TW).  
  
**[Aberto a sugestões]**  
  
## 2. Módulo Consultor  
  
### 2.1. Cartão  
  
**Funcionalidade de Salvar Cartão:**  
  
* Implementar a opção para o consultor **salvar dados de cartão** para pagamentos futuros, otimizando o processo de checkout e melhorando a experiência do usuário.  
  
### 2.2. Tela de Pagamento  
  
**Geração de Link/Checkout de Pagamento:**  
  
* Após a confirmação da modalidade de pagamento, valores e parcelamento pelo consultor, o sistema deve ser capaz de **gerar um link de pagamento** ou **direcionar para um checkout** que pode ser carregado dentro do próprio portal (alguns consultores podem solicitar que a líder gere um link). A nomenclatura pode ser algo do tipo “Pagar Agora ou Gerar o Link de Pagamento” (Pensando no nosso público alvo que talvez não esteja tão familiarizado com o termo “checkout” nesse contexto)  
  
**Pré-preenchimento de Dados do Consultor:**  
  
* O cadastro do consultor deve conter todas as informações necessárias para que o checkout seja **pré-preenchido automaticamente**, eliminando a necessidade de o consultor inserir dados repetidamente. O consultor deve ter a capacidade de **alterar seus próprios dados cadastrais** através de seu perfil, sem a intervenção do administrador.  
  
**Limite de Links Ativos:**  
  
* Estabelecer um **limite de 5 links de pagamento ativos por documento**, para evitar abusos e gerenciar recursos de forma eficaz.  
  
### 2.3. Histórico de Pagamentos  
  
**Reativação de Links Pendentes:**  
  
* O consultor deve ter a capacidade de **reabrir links ou checkouts de pagamento pendentes** a partir do histórico. É importante notar que links ou checkouts de pagamento terão uma **expiração no dia em que foram gerados**, sendo necessário gerar um novo caso o prazo tenha expirado.  
  
### 2.4. Perfil  
  
**Edição de Dados Cadastrais:**  
  
* O consultor deve conseguir **alterar suas informações de cadastro**, com exceção dos campos **E-mail, CPF e RG**, que devem permanecer inalteráveis para garantir a segurança e a integridade dos dados primários do usuário.  
  
# 3. Módulo Empresária  
  
3.1. Cor do header (cabeçalho)  
  
* Suavizar a intensidade do Roxo para combinar com a identidade visual das outras telas.  
