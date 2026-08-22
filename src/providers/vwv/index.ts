import type { ProviderFactory } from '../../shared/types.js';
import { defineProviderComponent } from '../../contracts/provider-component.js';
import { readBooleanEnv } from '../../config.js';
import { VwvProvider } from './provider.js';
import { VwvDataClient } from './data-client.js';

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_VWV_ENABLED', true)) return null;
  return new VwvProvider();
};

export const component = defineProviderComponent({
  metadata: {
    id: 'vwv',
    description: 'Administrative regulations of the German federal ministries',
    distribution: 'public',
    access: 'public',
    resourceTypes: ['administrative-guidance'],
    enablementVariables: ['GLMCP_VWV_ENABLED'],
    runtime: { browser: false, cache: true, daemon: false, search: true, documents: true, tableOfContents: false, authentication: false, status: false, enumeration: false },
  },
  createMcpProvider: createProvider,
  createDataClient: () => new VwvDataClient(),
});

export * from './data-client.js';
export { VwvClient } from './client.js';
