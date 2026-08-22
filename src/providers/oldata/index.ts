import type { ProviderFactory } from '../../shared/types.js';
import { defineProviderComponent } from '../../contracts/provider-component.js';
import { readBooleanEnv } from '../../config.js';
import { OldataProvider } from './provider.js';
import { OldataDataClient } from './data-client.js';

export const createProvider: ProviderFactory = () => {
  if (!readBooleanEnv('GLMCP_OLDATA_ENABLED', true)) return null;
  return new OldataProvider();
};

export const component = defineProviderComponent({
  metadata: {
    id: 'oldata',
    description: 'Open Legal Data — German court decisions including the instances',
    distribution: 'public',
    access: 'public',
    resourceTypes: ['case-law'],
    enablementVariables: ['GLMCP_OLDATA_ENABLED'],
    runtime: { browser: false, cache: false, daemon: false, search: true, documents: true, tableOfContents: false, authentication: false, status: false, enumeration: false },
  },
  createMcpProvider: createProvider,
  createDataClient: () => new OldataDataClient(),
});

export * from './data-client.js';
export { OldataClient } from './client.js';
