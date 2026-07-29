import type {
  ProviderManifestEntry,
  ProviderModule,
} from './shared/types.js';

const PROVIDER_LOADERS = {
  arxiv: () => import('./providers/arxiv/index.js') as Promise<ProviderModule>,
  dip: () => import('./providers/dip/index.js') as Promise<ProviderModule>,
  eul: () => import('./providers/eul/index.js') as Promise<ProviderModule>,
  icu: () => import('./providers/icu/index.js') as Promise<ProviderModule>,
  legis: () => import('./providers/legis/index.js') as Promise<ProviderModule>,
  rii: () => import('./providers/rii/index.js') as Promise<ProviderModule>,
  ris: () => import('./providers/ris/index.js') as Promise<ProviderModule>,
  nautos: () => import('./providers/nautos/index.js') as Promise<ProviderModule>,
} as const;

type ProviderName = keyof typeof PROVIDER_LOADERS;

function loadProvider(name: ProviderName): Promise<ProviderModule> {
  return PROVIDER_LOADERS[name]();
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
    name: 'ris',
    description: 'Austrian federal law and case law (RIS)',
    distribution: 'public',
    enablementVariables: ['GLMCP_RIS_ENABLED'],
    capabilities: {
      browser: false, cache: false, daemon: false, search: true, documents: true,
    },
    load: () => loadProvider('ris'),
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
