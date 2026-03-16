const tenantKey = process.env.GLMCP_NAUTOS_TENANT_KEY ?? '';
const username = process.env.GLMCP_NAUTOS_USERNAME ?? '';
const password = process.env.GLMCP_NAUTOS_PASSWORD ?? '';
const hasIpAuth = !!tenantKey;
const hasUserAuth = !!(username && password);
const explicitEnabled = process.env.GLMCP_NAUTOS_ENABLED;

export const nautosConfig = {
  baseUrl: 'https://nautos.de',
  tenantKey,
  tenantId: process.env.GLMCP_NAUTOS_TENANT_ID ?? '',
  username,
  password,
  enabled: explicitEnabled !== undefined ? explicitEnabled === 'true' : (hasIpAuth || hasUserAuth),
};
