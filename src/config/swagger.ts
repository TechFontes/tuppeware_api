import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Portal de Gestão de Débitos e Pagamentos - API',
      version: '1.0.0',
      description: 'API para gestão de débitos e pagamentos de consultores. Suporta autenticação JWT, importação de dados via CSV, geração de links de pagamento via Asaas e notificações em tempo real via WebSocket.',
      contact: {
        name: 'TechFontes',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API Base',
      },
    ],
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
          required: ['debtIds', 'method'],
          properties: {
            debtIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              description: 'IDs dos débitos a serem pagos',
            },
            method: {
              type: 'string',
              enum: ['PIX', 'CARTAO_CREDITO'],
              description: 'Método de pagamento',
            },
            installments: {
              type: 'integer',
              minimum: 1,
              maximum: 3,
              description: 'Número de parcelas (apenas para cartão de crédito)',
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
            role: { type: 'string', enum: ['ADMIN', 'EMPRESARIA', 'LIDER', 'CONSULTOR'] },
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
            status: { type: 'string', enum: ['PENDENTE', 'ATRASADO', 'PAGO'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            method: { type: 'string', enum: ['PIX', 'CARTAO_CREDITO'] },
            installments: { type: 'integer' },
            subtotal: { type: 'number', format: 'decimal' },
            fee: { type: 'number', format: 'decimal' },
            totalValue: { type: 'number', format: 'decimal' },
            status: { type: 'string', enum: ['PENDENTE', 'PAGO', 'CANCELADO'] },
            paymentLink: { type: 'string', nullable: true },
            asaasId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
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
            data: { type: 'array', items: {} },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                limit: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasNextPage: { type: 'boolean' },
                hasPreviousPage: { type: 'boolean' },
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
