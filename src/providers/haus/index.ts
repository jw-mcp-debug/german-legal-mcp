import type { ProviderFactory } from '../../shared/types.js';
import { defineProviderComponent } from '../../contracts/provider-component.js';
import { readHausConfig } from './config.js';
import { HausProvider } from './provider.js';
import { HausDataClient } from './data-client.js';
import { HausIndexStore } from './store.js';

export const createProvider: ProviderFactory = () => {
  const config = readHausConfig();
  if (!config.enabled) return null;
  return new HausProvider(config);
};

export const component = defineProviderComponent({
  metadata: {
    id: 'haus',
    description: 'Published administrative documents of this institution',
    distribution: 'private',
    access: 'public',
    resourceTypes: ['administrative-guidance'],
    enablementVariables: [
      'GLMCP_HAUS_ENABLED',
      'GLMCP_HAUS_INDEX',
      'GLMCP_HAUS_STALE_MONTHS',
    ],
    runtime: { browser: false, cache: true, daemon: false, search: true, documents: true, tableOfContents: false, authentication: false, status: false, enumeration: true },
  },
  createMcpProvider: createProvider,
  createDataClient: () => new HausDataClient(new HausIndexStore(readHausConfig().indexPath)),
});

export * from './data-client.js';
export * from './ingest.js';
export { HausIndexStore } from './store.js';
export type { HausConfig } from './config.js';
