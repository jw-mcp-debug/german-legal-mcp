import type {
  ProviderManifestEntry,
  ProviderModule,
} from './shared/types.js';

function loadProvider(name: string): Promise<ProviderModule> {
  return import(`./providers/${name}/index.js`) as Promise<ProviderModule>;
}

export const PROVIDER_MANIFEST: readonly ProviderManifestEntry[] = [
  {
    name: 'arxiv',
    description: 'arXiv legal and interdisciplinary preprints',
    distribution: 'public',
    enablementVariables: ['GLMCP_ARXIV_ENABLED'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('arxiv'),
  },
  {
    name: 'dip',
    description: 'German Bundestag parliamentary information',
    distribution: 'public',
    enablementVariables: ['GLMCP_DIP_ENABLED', 'GLMCP_DIP_API_KEY'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('dip'),
  },
  {
    name: 'eul',
    description: 'EUR-Lex European Union law',
    distribution: 'public',
    enablementVariables: ['GLMCP_EUL_ENABLED'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('eul'),
  },
  {
    name: 'icu',
    description: 'InfoCuria Court of Justice case law',
    distribution: 'public',
    enablementVariables: ['GLMCP_ICU_ENABLED'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('icu'),
  },
  {
    name: 'legis',
    description: 'German federal and state legislation',
    distribution: 'public',
    enablementVariables: ['GLMCP_LEGIS_ENABLED'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('legis'),
  },
  {
    name: 'rii',
    description: 'German federal and Bavarian case law',
    distribution: 'public',
    enablementVariables: ['GLMCP_RII_ENABLED'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('rii'),
  },
  {
    name: 'nautos',
    description: 'Nautos technical standards',
    distribution: 'public',
    enablementVariables: [
      'GLMCP_NAUTOS_ENABLED',
      'GLMCP_NAUTOS_TENANT_KEY',
      'GLMCP_NAUTOS_USERNAME',
      'GLMCP_NAUTOS_PASSWORD',
    ],
    capabilities: {
      browser: false, cache: true, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('nautos'),
  },
] as const;

export function getProviderManifest(
  distribution?: ProviderManifestEntry['distribution'],
): readonly ProviderManifestEntry[] {
  return distribution === undefined
    ? PROVIDER_MANIFEST
    : PROVIDER_MANIFEST.filter((entry) => entry.distribution === distribution);
}
