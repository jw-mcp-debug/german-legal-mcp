import type { ProviderFactory } from '../../shared/types.js';
import { readBooleanEnv } from '../../config.js';
import { IcuProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_ICU_ENABLED', true)) return null;
  return new IcuProvider();
};
