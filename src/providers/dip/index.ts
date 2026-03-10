import type { Provider } from '../../shared/types.js';
import { dipConfig } from './config.js';
import { DipProvider } from './provider.js';

export function createProvider(): Provider | null {
  if (!dipConfig.enabled) return null;
  return new DipProvider();
}
