import type { Environment } from './config-core.js';
import {
  getEnvironment,
  redactCataloguedEnvironment,
} from './config-core.js';
import { PUBLIC_ENVIRONMENT_VARIABLES } from './environment-catalog.public.js';
import { PRIVATE_ENVIRONMENT_VARIABLES } from './environment-catalog.private.js';

export * from './config-core.js';

export const ENVIRONMENT_VARIABLES = [
  ...PUBLIC_ENVIRONMENT_VARIABLES,
  ...PRIVATE_ENVIRONMENT_VARIABLES,
] as const;

export function redactEnvironment(
  env: Environment = getEnvironment(),
): Record<string, string> {
  return redactCataloguedEnvironment(ENVIRONMENT_VARIABLES, env);
}
