import type { ProviderFactory } from '../../shared/types.js';
import { arxivConfig } from './config.js';
import { ArxivProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!arxivConfig.enabled) return null;
  return new ArxivProvider();
};
