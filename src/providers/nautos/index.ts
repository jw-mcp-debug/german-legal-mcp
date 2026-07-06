import type { ProviderFactory } from '../../shared/types.js';
import { nautosConfig } from './config.js';
import { NautosProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!nautosConfig.enabled) return null;
  return new NautosProvider();
};
