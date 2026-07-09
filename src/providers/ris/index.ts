import type { ProviderFactory } from '../../shared/types.js';
import { readBooleanEnv } from '../../config.js';
import { RisProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_RIS_ENABLED', true)) return null;
  return new RisProvider();
};
