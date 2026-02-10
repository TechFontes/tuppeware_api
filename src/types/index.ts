// Re-export dos tipos gerados pelo Prisma
export type {
  User,
  Consultant,
  Debt,
  Payment,
  PaymentDebt,
  PasswordReset,
} from '../../generated/prisma/client';

export {
  UserRole,
  DebtStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../generated/prisma/client';

// DTOs
export interface RegisterDTO {
  name: string;
  cpf: string;
  email: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface CreatePaymentDTO {
  debtIds: string[];
  method: 'PIX' | 'CARTAO_CREDITO';
  installments?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ImportResult {
  total: number;
  success: number;
  errors: Array<{ line: number; message: string }>;
}

export interface AsaasPaymentLink {
  id: string;
  paymentLink: string;
}

export interface CreatePaymentLinkParams {
  value: number;
  method: string;
  installments: number;
  description: string;
}
