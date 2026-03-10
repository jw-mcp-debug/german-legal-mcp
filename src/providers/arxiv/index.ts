import type { Provider } from '../../shared/types.js';
import { arxivConfig } from './config.js';
import { ArxivProvider } from './provider.js';

export function createProvider(): Provider | null {
  if (!arxivConfig.enabled) return null;
  return new ArxivProvider();
}
