const eredeSandboxUrl = 'https://sandbox-erede.useredecloud.com.br/v2/transactions';
const eredeProductionUrl = 'https://api.userede.com.br/erede/v2/transactions';
const eredeOAuthSandboxUrl = 'https://rl7-sandbox-api.useredecloud.com.br/oauth2/token';
const eredeOAuthProductionUrl = 'https://rl7-api.useredecloud.com.br/oauth2/token';
const eredeTokenServiceSandboxUrl = 'https://rl7-sandbox-api.useredecloud.com.br/token-service/oauth/v2';
const eredeTokenServiceProductionUrl = 'https://rl7-api.useredecloud.com.br/token-service/oauth/v2';

const isProd = process.env.NODE_ENV === 'production';

export const eredeClientId = process.env.EREDE_CLIENT_ID || '';
export const eredeClientSecret = process.env.EREDE_CLIENT_SECRET || '';
export const eredeOAuthUrl = process.env.EREDE_OAUTH_URL || (isProd ? eredeOAuthProductionUrl : eredeOAuthSandboxUrl);
export const eredeTokenServiceUrl = process.env.EREDE_TOKEN_SERVICE_URL || (isProd ? eredeTokenServiceProductionUrl : eredeTokenServiceSandboxUrl);
export const eredeApiUrl = process.env.EREDE_API_URL || (isProd ? eredeProductionUrl : eredeSandboxUrl);
export const eredeTimeoutMs = parseInt(process.env.EREDE_TIMEOUT_MS || '', 10) || 15000;
export const eredeCallbackSecret = process.env.EREDE_CALLBACK_SECRET || '';
export const eredePixExpirationHours = parseInt(process.env.EREDE_PIX_EXPIRATION_HOURS || '', 10) || 24;
export const eredeSoftDescriptor = process.env.EREDE_SOFT_DESCRIPTOR || 'Tuppeware';
