// Re-export dos tipos gerados pelo Prisma
export type {
  User,
  Consultant,
  Debt,
  Payment,
  PaymentDebt,
  PasswordReset,
  SavedCard,
  Setting,
  EredeWebhookEvent,
} from '../../generated/prisma/client';

export {
  UserRole,
  DebtStatus,
  PaymentMethod,
  PaymentStatus,
  SavedCardStatus,
  EredeWebhookEventType,
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
  saveCard?: boolean;
  savedCardId?: string;
  card?: {
    number: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    holderName: string;
  };
  billing?: {
    name: string;
    email: string;
    phone: string;
    document: string;
    birthDate?: string;
    address: string;
    address2?: string;
    district: string;
    city: string;
    state: string;
    postalcode: string;
    country?: string;
  };
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

// ==========================================
// eRede Gateway Types
// ==========================================

export interface ERedeBillingAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  country: string; // ISO alpha-3: "BRA"
}

export interface ERedeBilling {
  name: string;
  document: string; // CPF ou CNPJ, somente dígitos
  email: string;
  address: ERedeBillingAddress;
}

export interface ERedePixRequest {
  kind: 'pix';
  reference: string;
  amount: number; // centavos
  expirationDate: string; // ISO 8601
}

export interface ERedeCreditRequest {
  kind: 'credit';
  reference: string;
  amount: number; // centavos
  installments: number;
  cardHolderName?: string;
  cardNumber?: string;
  cardToken?: string;
  expirationMonth?: string;
  expirationYear?: string;
  securityCode: string;
  capture: true;
  softDescriptor: string;
  billing: ERedeBilling;
}

export type ERedeTransactionRequest = ERedePixRequest | ERedeCreditRequest;

export interface ERedePixData {
  qrCode: string;   // string EMV para copiar-colar
  link: string;     // URL imagem do QR code
  expirationDate: string;
}

export interface ERedeTransactionResponse {
  tid: string;
  returnCode: string;     // "00" = aprovado
  returnMessage: string;
  reference: string;
  nsu?: string;
  authorizationCode?: string;
  dateTime?: string;
  cardBin?: string;
  brandTid?: string;
  transactionLinkId?: string;
  pix?: ERedePixData;
  raw: Record<string, unknown>;
}

export interface ERedeQueryResponse {
  tid: string;
  returnCode: string;
  returnMessage: string;
  status: number;   // 0=aprovado, 3=pendente, 4=cancelado
  amount: number;
  reference: string;
  raw: Record<string, unknown>;
}

export interface ERedeCallbackPayload {
  tid: string;
  returnCode: string;
  status: number;
  reference: string;
  amount: number;
  nsu?: string;
  authorizationCode?: string;
}

export {
  AdminPermission,
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  isValidPermission,
  hasPermission,
} from './permissions';
export type { PermissionCatalogEntry } from './permissions';
