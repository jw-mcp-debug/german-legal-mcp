import type { ProviderFactory } from '../../shared/types.js';
import { readBooleanEnv } from '../../config.js';
import { EulProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_EUL_ENABLED', true)) return null;
  return new EulProvider();
};
