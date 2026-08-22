import type {
  ProviderComponentModule,
  ProviderComponentReference,
} from '../../contracts/provider-component.js';

function privateComponent(
  id: string,
  load: () => Promise<ProviderComponentModule>,
): ProviderComponentReference {
  return { id, distribution: 'private', load };
}

/**
 * Providers that read this institution's own material rather than a public
 * portal. They ship in the same tree but are disabled unless their enablement
 * variable is set, so a deployment that does not configure them behaves exactly
 * as it did before they existed.
 */
export const PRIVATE_PROVIDER_MANIFEST: readonly ProviderComponentReference[] = [
  privateComponent('haus', () => import('../../providers/haus/index.js')),
] as const;
