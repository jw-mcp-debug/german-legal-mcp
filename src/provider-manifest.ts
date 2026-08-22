import type { ProviderDistribution } from './contracts/provider-component.js';
import { filterProviderManifest } from './components/manifests/filter.js';
import { PUBLIC_PROVIDER_MANIFEST } from './components/manifests/public.js';
import { PRIVATE_PROVIDER_MANIFEST } from './components/manifests/private.js';

export const PROVIDER_MANIFEST = [
  ...PUBLIC_PROVIDER_MANIFEST,
  ...PRIVATE_PROVIDER_MANIFEST,
] as const;

export function getProviderManifest(
  distribution?: ProviderDistribution,
) {
  return filterProviderManifest(PROVIDER_MANIFEST, distribution);
}
