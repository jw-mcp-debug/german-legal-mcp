import type { Provider } from '../../shared/types.js';
import { nautosConfig } from './config.js';
import { NautosProvider } from './provider.js';

export function createProvider(): Provider | null {
  if (!nautosConfig.enabled) return null;
  return new NautosProvider();
}
