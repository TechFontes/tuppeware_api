import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Portal de Gestão de Débitos e Pagamentos - API',
      version: '1.0.0',
      description: 'API para gestão de débitos e pagamentos de consultores. Suporta autenticação JWT, importação de dados via CSV, pagamentos via eRede e notificações em tempo real via WebSocket.',
      contact: {
        name: 'TechFontes',
      },
    },
    servers: [
      { url: '/api', description: 'Servidor local / desenvolvimento' },
      { url: 'https://api.tupperwarees.com.br/api', description: 'Produção' },
    ],
    tags: [
      { name: 'Auth', description: 'Autenticação e recuperação de senha' },
      { name: 'Users', description: 'Perfil do usuário autenticado e cartões salvos (Cofre eRede)' },
      { name: 'Debts', description: 'Consulta e listagem de débitos' },
      { name: 'Payments', description: 'Criação de pagamentos (PIX e cartão de crédito)' },
      { name: 'Payment History', description: 'Histórico e reabertura de links de pagamento' },
      { name: 'Admin', description: 'Gestão administrativa — requer permissão granular ou role ADMIN/GERENTE' },
      { name: 'eRede', description: 'Webhooks do gateway eRede (tokenização e transação)' },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido via login',
        },
      },
      schemas: {
        UserRole: {
          type: 'string',
          enum: ['ADMIN', 'GERENTE', 'EMPRESARIA', 'LIDER', 'CONSULTOR'],
          description: 'Papel do usuário no sistema',
        },
        DebtStatus: {
          type: 'string',
          enum: ['PENDENTE', 'ATRASADO', 'PAGO'],
          description: 'Status do débito',
        },
        PaymentStatus: {
          type: 'string',
          enum: ['PENDENTE', 'PAGO', 'CANCELADO'],
          description: 'Status do pagamento',
        },
        PaymentMethod: {
          type: 'string',
          enum: ['PIX', 'CARTAO_CREDITO'],
          description: 'Método de pagamento',
        },
        SavedCardStatus: {
          type: 'string',
          enum: ['PENDING', 'ACTIVE', 'INACTIVE', 'FAILED'],
          description: 'Status da tokenização do cartão no Cofre eRede',
        },
        AdminPermission: {
          type: 'string',
          enum: [
            'users.manage',
            'debts.manage',
            'payments.manage',
            'reports.view',
            'reports.export',
            'settings.manage',
            'admins.manage',
            'transactions.approve',
          ],
          description: 'Chave de permissão granular para usuários ADMIN',
        },
        PermissionCatalogEntry: {
          type: 'object',
          properties: {
            key: { $ref: '#/components/schemas/AdminPermission' },
            labelPt: { type: 'string', example: 'Gerenciar Usuários' },
            description: { type: 'string', example: 'Criar, editar e excluir usuários consultores/líderes' },
          },
        },
        EredeWebhookEventType: {
          type: 'string',
          enum: ['TOKENIZATION', 'TRANSACTION'],
          description: 'Categoria interna do evento (mapeada a partir do eventType string da eRede)',
        },
        RegisterDTO: {
          type: 'object',
          required: ['name', 'cpf', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'Maria Silva', description: 'Nome completo' },
            cpf: { type: 'string', example: '12345678901', description: 'CPF (com ou sem formatação)' },
            email: { type: 'string', format: 'email', example: 'maria@email.com' },
            password: { type: 'string', minLength: 6, example: 'senha123' },
          },
        },
        LoginDTO: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'maria@email.com' },
            password: { type: 'string', example: 'senha123' },
          },
        },
        ForgotPasswordDTO: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', example: 'maria@email.com' },
          },
        },
        ResetPasswordDTO: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string', description: 'Token de recuperação recebido por e-mail' },
            password: { type: 'string', minLength: 6, example: 'novaSenha123' },
          },
        },
        CreatePaymentDTO: {
          type: 'object',
          required: ['debtIds', 'method', 'billing'],
          properties: {
            debtIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              description: 'IDs dos débitos a serem pagos',
            },
            method: {
              $ref: '#/components/schemas/PaymentMethod',
            },
            installments: {
              type: 'integer',
              minimum: 1,
              maximum: 3,
              description: 'Número de parcelas (apenas para cartão de crédito)',
            },
            card: {
              type: 'object',
              description: 'Obrigatório quando method = CARTAO_CREDITO',
              properties: {
                number: { type: 'string', example: '4111111111111111' },
                expMonth: { type: 'string', example: '12' },
                expYear: { type: 'string', example: '2028' },
                cvv: { type: 'string', example: '123' },
                holderName: { type: 'string', example: 'Maria Silva' },
              },
            },
            saveCard: {
              type: 'boolean',
              description: 'Salvar cartão para uso futuro (apenas cartão de crédito)',
            },
            savedCardId: {
              type: 'string',
              format: 'uuid',
              description: 'ID de um cartão salvo previamente. Quando presente, apenas card.cvv é obrigatório.',
            },
            billing: {
              type: 'object',
              required: ['name', 'email', 'phone', 'document', 'birthDate', 'address', 'district', 'city', 'state', 'postalcode'],
              properties: {
                name: { type: 'string', example: 'Maria Silva' },
                email: { type: 'string', format: 'email', example: 'maria@email.com' },
                phone: { type: 'string', example: '11999999999' },
                document: { type: 'string', example: '12345678901' },
                birthDate: { type: 'string', example: '1990-01-20' },
                address: { type: 'string', example: 'Rua Exemplo, 100' },
                address2: { type: 'string', example: 'Apto 101' },
                district: { type: 'string', example: 'Centro' },
                city: { type: 'string', example: 'São Paulo' },
                state: { type: 'string', example: 'SP' },
                postalcode: { type: 'string', example: '01001000' },
                country: { type: 'string', example: 'BR' },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            cpf: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { $ref: '#/components/schemas/UserRole' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Debt: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            codigo: { type: 'string' },
            nome: { type: 'string' },
            grupo: { type: 'string' },
            distrito: { type: 'string' },
            semana: { type: 'string' },
            valor: { type: 'number', format: 'decimal' },
            diasAtraso: { type: 'integer' },
            dataVencimento: { type: 'string', format: 'date-time' },
            numeroNf: { type: 'string' },
            status: { $ref: '#/components/schemas/DebtStatus' },
            paidAmount: { type: 'number', format: 'decimal', description: 'Valor já pago via pagamentos parciais (acumulado)' },
            remaining: { type: 'number', format: 'decimal', description: 'Valor restante a pagar (valor - paidAmount)' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            method: { $ref: '#/components/schemas/PaymentMethod' },
            installments: { type: 'integer' },
            subtotal: { type: 'number', format: 'decimal' },
            fee: { type: 'number', format: 'decimal' },
            totalValue: { type: 'number', format: 'decimal' },
            status: { $ref: '#/components/schemas/PaymentStatus' },
            gatewayProvider: { type: 'string', enum: ['EREDE'] },
            referenceNum: { type: 'string', nullable: true },
            gatewayTransactionId: { type: 'string', nullable: true },
            gatewayOrderId: { type: 'string', nullable: true },
            gatewayStatusCode: { type: 'string', nullable: true },
            gatewayStatusMessage: { type: 'string', nullable: true },
            processorReference: { type: 'string', nullable: true },
            paymentLink: { type: 'string', nullable: true },
            qrCode: { type: 'string', nullable: true, description: 'String EMV do QR Code PIX (copiar-colar)' },
            nsu: { type: 'string', nullable: true, description: 'Número Sequencial Único — identificador da adquirente/bandeira, gerado após confirmação', example: '123456' },
            authorizationCode: { type: 'string', nullable: true, description: 'Código de autorização retornado pela bandeira (presente em pagamentos com cartão)', example: '789012' },
            isPartial: { type: 'boolean', description: 'Indica se este pagamento é um pagamento parcial de uma dívida' },
            callbackPayload: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatePartialPaymentDTO: {
          type: 'object',
          required: ['debtId', 'amount'],
          properties: {
            debtId: {
              type: 'string',
              format: 'uuid',
              description: 'ID da dívida a ser paga parcialmente',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
            amount: {
              type: 'number',
              format: 'decimal',
              description: 'Valor a ser pago nesta parcela (em reais)',
              example: 40.00,
            },
          },
        },
        PartialPaymentResponse: {
          type: 'object',
          properties: {
            paymentId: { type: 'string', format: 'uuid', description: 'ID do pagamento criado' },
            referenceNum: { type: 'string', description: 'Referência única no formato TPW-{timestamp}-{userId[0:8]}' },
            qrCode: { type: 'string', nullable: true, description: 'String EMV do QR Code PIX para pagamento parcial' },
          },
        },
        ImportResult: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total de registros processados' },
            success: { type: 'integer', description: 'Registros importados com sucesso' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  line: { type: 'integer' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object' },
              description: 'Itens da página (tipo varia por endpoint — veja allOf no endpoint específico)',
            },
            pagination: {
              type: 'object',
              required: ['total', 'page', 'limit', 'totalPages', 'hasNextPage', 'hasPreviousPage'],
              properties: {
                total: { type: 'integer', example: 150 },
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 20 },
                totalPages: { type: 'integer', example: 8 },
                hasNextPage: { type: 'boolean', example: true },
                hasPreviousPage: { type: 'boolean', example: false },
              },
            },
          },
        },
        AuthSuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                token: {
                  type: 'string',
                  description: 'JWT assinado — expira em 7 dias',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
              },
            },
          },
        },
        SavedCardResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/SavedCardStatus' },
            cardBrand: { type: 'string', nullable: true, example: 'Visa' },
            lastFour: { type: 'string', example: '1111' },
            holderName: { type: 'string', example: 'JOAO DA SILVA' },
            bin: { type: 'string', nullable: true, example: '411111' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ReopenPaymentResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                checkoutUrl: {
                  type: 'string',
                  description: 'URL da imagem PNG do QR Code (data:image/png;base64,... inline)',
                },
                qrCode: {
                  type: 'string',
                  description: 'String EMV para copiar-colar no app bancário',
                },
              },
            },
          },
        },
        DebtSummaryResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                totalDebitos: { type: 'integer', example: 142 },
                valorTotal: { type: 'number', format: 'decimal', example: 12345.67 },
                consultoresAtraso: { type: 'integer', example: 18 },
                gruposAtivos: { type: 'integer', example: 7 },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['fail', 'error'] },
            message: { type: 'string' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'fail' },
            message: { type: 'string', example: 'Erro de validação.' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
