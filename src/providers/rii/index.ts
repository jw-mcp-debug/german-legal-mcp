import type { ProviderFactory } from '../../shared/types.js';
import { readBooleanEnv } from '../../config.js';
import { RiiProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_RII_ENABLED', true)) return null;
  return new RiiProvider();
};
