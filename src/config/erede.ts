const eredeSandboxUrl = 'https://sandbox-erede.useredecloud.com.br/rede/v1/transactions';
const eredeProductionUrl = 'https://api.userede.com.br/rede/v1/transactions';

export const eredePv = process.env.EREDE_PV || '';
export const eredeIntegrationKey = process.env.EREDE_INTEGRATION_KEY || '';
export const eredeTimeoutMs = parseInt(process.env.EREDE_TIMEOUT_MS || '', 10) || 15000;
export const eredeApiUrl = process.env.EREDE_API_URL || (
  process.env.NODE_ENV === 'production' ? eredeProductionUrl : eredeSandboxUrl
);
export const eredeCallbackSecret = process.env.EREDE_CALLBACK_SECRET || '';
export const eredePixExpirationHours = parseInt(process.env.EREDE_PIX_EXPIRATION_HOURS || '', 10) || 24;
export const eredeSoftDescriptor = process.env.EREDE_SOFT_DESCRIPTOR || 'Tuppeware';
