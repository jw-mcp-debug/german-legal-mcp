// Public API key — expires 2026-06-01
const DEFAULT_API_KEY = Date.now() < new Date('2026-06-01').getTime() ? 'OSOegLs.PR2lwJ1dwCeje9vTj7FPOt3hvpYKtwKkhw' : '';

export const dipConfig = {
  apiKey: process.env.GLMCP_DIP_API_KEY ?? DEFAULT_API_KEY,
  baseUrl: 'https://search.dip.bundestag.de/api/v1',
  enabled: process.env.GLMCP_DIP_ENABLED !== 'false' && !!(process.env.GLMCP_DIP_API_KEY ?? DEFAULT_API_KEY),
};
