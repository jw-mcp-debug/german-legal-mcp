import type { EnvironmentVariable } from './config-core.js';

/**
 * Variables belonging to providers that read this institution's own material.
 * Kept apart from the public catalogue so that a distribution built without the
 * private providers documents exactly the variables it actually honours.
 */
export const PRIVATE_ENVIRONMENT_VARIABLES: readonly EnvironmentVariable[] = [
  { name: 'GLMCP_HAUS_ENABLED', description: 'Enable the house-document provider.', defaultValue: 'false' },
  { name: 'GLMCP_HAUS_INDEX', description: 'Path to the house-document SQLite index.' },
  { name: 'GLMCP_HAUS_STALE_MONTHS', description: 'Age in months beyond which a document\'s Stand is flagged.', defaultValue: '24' },
] as const;
