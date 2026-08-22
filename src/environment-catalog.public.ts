import type { EnvironmentVariable } from './config-core.js';

export const PUBLIC_ENVIRONMENT_VARIABLES: readonly EnvironmentVariable[] = [
  { name: 'GLMCP_STATE_DIR', description: 'Application state root directory.' },
  { name: 'GLMCP_LOG_LEVEL', description: 'Structured log level.', defaultValue: 'info' },
  { name: 'GLMCP_HTTP', description: 'Serve MCP over Streamable HTTP instead of stdio.', defaultValue: 'false' },
  { name: 'GLMCP_HTTP_TOKEN', description: 'Bearer token required on every HTTP request. Mandatory when GLMCP_HTTP is true.', secret: true },
  { name: 'GLMCP_HTTP_PORT', description: 'HTTP listen port, used when the platform sets no PORT.', defaultValue: '3000' },
  { name: 'GLMCP_DIP_API_KEY', description: 'DIP API key.', secret: true },
  { name: 'GLMCP_DIP_ENABLED', description: 'Enable the DIP provider.', defaultValue: 'true' },
  { name: 'GLMCP_EUL_ENABLED', description: 'Enable the EUR-Lex provider.', defaultValue: 'true' },
  { name: 'GLMCP_ICU_ENABLED', description: 'Enable the InfoCuria provider.', defaultValue: 'true' },
  { name: 'GLMCP_LEGIS_ENABLED', description: 'Enable the legislation provider.', defaultValue: 'true' },
  { name: 'GLMCP_RII_ENABLED', description: 'Enable the RII provider.', defaultValue: 'true' },
] as const;
