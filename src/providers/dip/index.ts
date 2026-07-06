import type { ProviderFactory } from '../../shared/types.js';
import { dipConfig } from './config.js';
import { DipProvider } from './provider.js';

export const createProvider: ProviderFactory = () => {
  if (!dipConfig.enabled) return null;
  return new DipProvider();
};
