import type {
  LegalResourceReference,
} from './legal-resource.js';

export interface LegalTableOfContentsEntry {
  readonly id: string;
  readonly title: string;
  readonly label?: string;
  readonly level: number;
  readonly children?: readonly LegalTableOfContentsEntry[];
}

export interface LegalTableOfContents<
  TReference extends LegalResourceReference = LegalResourceReference,
> {
  readonly reference: TReference;
  /** Native means supplied by the source; derived means parsed from content. */
  readonly origin: 'native' | 'derived';
  readonly entries: readonly LegalTableOfContentsEntry[];
}

export interface TableOfContentsCapability<
  TReference extends LegalResourceReference = LegalResourceReference,
> {
  getTableOfContents(
    reference: TReference,
  ): Promise<LegalTableOfContents<TReference>>;
}

export type AuthenticationState =
  | 'authenticated'
  | 'unauthenticated'
  | 'expired'
  | 'unavailable'
  | 'unknown';

export type AuthenticationMethod =
  | 'credentials'
  | 'institutional'
  | 'network'
  | 'persisted-session'
  | 'none'
  | 'other';

export interface ProviderAuthenticationStatus {
  readonly state: AuthenticationState;
  readonly method: AuthenticationMethod;
  readonly expiresAt?: string;
  readonly message?: string;
}

/**
 * Generic session lifecycle. Credentials and browser details remain provider
 * configuration; consumers only request a fresh session or log it out.
 */
export interface AuthenticationCapability {
  getAuthenticationStatus(): Promise<ProviderAuthenticationStatus>;
  refreshAuthentication(): Promise<ProviderAuthenticationStatus>;
  logout(): Promise<void>;
}

export type ProviderOperationalState =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'unknown';

export interface ProviderOperationalStatus {
  readonly state: ProviderOperationalState;
  readonly checkedAt: string;
  readonly message?: string;
  readonly queueDepth?: number;
  readonly activeRequests?: number;
  readonly circuit?: 'closed' | 'open' | 'half-open' | 'unknown';
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface StatusCapability {
  getOperationalStatus(): Promise<ProviderOperationalStatus>;
}
