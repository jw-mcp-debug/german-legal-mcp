import { readBooleanEnv, readStringEnv } from '../../config.js';

const tenantKey = readStringEnv('GLMCP_NAUTOS_TENANT_KEY') ?? '';
const username = readStringEnv('GLMCP_NAUTOS_USERNAME') ?? '';
const password = readStringEnv('GLMCP_NAUTOS_PASSWORD') ?? '';
const hasIpAuth = !!tenantKey;
const hasUserAuth = !!(username && password);
const explicitEnabled = readStringEnv('GLMCP_NAUTOS_ENABLED');

export const nautosConfig = {
  baseUrl: 'https://nautos.de',
  tenantKey,
  tenantId: readStringEnv('GLMCP_NAUTOS_TENANT_ID') ?? '',
  username,
  password,
  enabled: explicitEnabled !== undefined
    ? readBooleanEnv('GLMCP_NAUTOS_ENABLED', false)
    : (hasIpAuth || hasUserAuth),
};
